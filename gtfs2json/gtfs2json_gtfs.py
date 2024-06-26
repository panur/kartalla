"""Parse GTFS files.

General Transit Feed Specification Reference: https://developers.google.com/transit/gtfs/reference

Author: Panu Ranta, panu.ranta@iki.fi, https://14142.net/kartalla/about.html
"""

import codecs
import collections
import csv
import datetime
import io
import json
import logging
import os
import math
import time
import zipfile

import polyline


def get_routes(input_dir_or_zip):
    """Parse GTFS files into dict of routes."""
    print('parsing shapes...')
    shapes = _parse_shapes(input_dir_or_zip, 'shapes.txt')
    print('parsing stops...')
    stops = _parse_stops(input_dir_or_zip, 'stops.txt')
    print('parsing calendar...')
    calendar_entries = _parse_calendar(input_dir_or_zip, 'calendar.txt')
    print('parsing calendar dates...')
    calendar_dates = _parse_calendar_dates(input_dir_or_zip, 'calendar_dates.txt')
    print('parsing stop times...')
    stop_times = _parse_stop_times(input_dir_or_zip, 'stop_times.txt')
    print('parsing routes...')
    routes = _parse_routes(input_dir_or_zip, 'routes.txt')
    print('parsing trips...')
    trips = _parse_trips(input_dir_or_zip, 'trips.txt')

    print('adding dates to trips...')
    _add_dates_to_trips(trips, calendar_entries, calendar_dates)
    print('adding stop times to trips...')
    _add_stop_times_to_trips(trips, stop_times)

    print('adding trips to routes...')
    _add_trips_to_routes(routes, trips)
    print('adding shapes to routes...')
    _add_shapes_to_routes(routes, shapes, stops)

    _delete_invalid_trips(routes)
    _delete_invalid_routes(routes)

    return routes


def _parse_shapes(input_dir_or_zip, shapes_txt):
    shapes = {}  # by shape_id

    with _open_file(input_dir_or_zip, shapes_txt, skip_utf8_bom=True) as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            if row['shape_id'] not in shapes:
                shapes[row['shape_id']] = {'is_invalid': False, 'points': []}
            point = (float(row['shape_pt_lat']), float(row['shape_pt_lon']))
            shapes[row['shape_id']]['points'].append(point)
            if (point == (58.432233, 20.142573)) or (point[0] < 0) or (point[1] < 0):
                shapes[row['shape_id']]['is_invalid'] = True

    logging.debug('parsed {} shapes'.format(len(shapes)))

    return shapes


def _open_file(input_dir_or_zip, path, skip_utf8_bom=False):
    if os.path.isdir(input_dir_or_zip):
        return open(os.path.join(input_dir_or_zip, path), 'r', encoding='utf-8-sig')
    else:
        with zipfile.ZipFile(input_dir_or_zip) as zip_file:
            input_file = zip_file.open(path)
            if skip_utf8_bom:
                if input_file.read(3) != codecs.BOM_UTF8:
                    input_file = zip_file.open(path)
            return io.TextIOWrapper(input_file)


def _is_file(input_dir_or_zip, path):
    if os.path.isdir(input_dir_or_zip):
        return os.path.isfile(os.path.join(input_dir_or_zip, path))
    else:
        with zipfile.ZipFile(input_dir_or_zip) as zip_file:
            return path in zip_file.namelist()


def _parse_stops(input_dir_or_zip, stops_txt):
    stops = {}

    with _open_file(input_dir_or_zip, stops_txt, skip_utf8_bom=True) as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            stops[row['stop_id']] = (float(row['stop_lat']), float(row['stop_lon']))

    logging.debug('parsed {} stops'.format(len(stops)))

    return stops


def _parse_routes(input_dir_or_zip, routes_txt):
    routes = collections.OrderedDict()  # by route_id
    route_types = _get_route_types(os.path.join(os.path.dirname(__file__), 'route_types.json'))

    with _open_file(input_dir_or_zip, routes_txt, skip_utf8_bom=True) as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            if row['route_type'] not in route_types:
                logging.error('In route_id={} route_type {} not in {}'.format(
                    row['route_id'], row['route_type'], route_types))
            # create new route
            routes[row['route_id']] = {
                'agency_id': row.get('agency_id', 0),
                'route_id': row['route_id'],
                'name': _get_route_name(row),
                'long_name': row['route_long_name'],
                'type': route_types.get(row['route_type'], row['route_type']),
                'is_departure_times': False,
                'trips': collections.OrderedDict(),
                'shapes': []
            }

    logging.debug('parsed {} routes'.format(len(routes)))

    return routes


def _get_route_types(route_types_path):
    # https://developers.google.com/transit/gtfs/reference/routes-file#routes_route_type_field
    # https://developers.google.com/transit/gtfs/reference/extended-route-types
    # 109: https://github.com/HSLdevcom/kalkati2gtfs/commit/d4758fb74d7455ddbf4032175ef8ff51c587ec7f
    with open(route_types_path) as route_types_file:
        input_route_types = json.load(route_types_file)
    route_types = {}  # key: number str ('0'), value: text str ('tram')
    for route_description in input_route_types:
        for route_type in input_route_types[route_description]:
            route_types[str(route_type)] = route_description
    return route_types


def _get_route_name(row):  # row in routes.txt
    if row['route_short_name'] != '':
        return row['route_short_name']
    else:
        return row['route_id']  # HSL metro routes do not have short names


def _parse_trips(input_dir_or_zip, trips_txt):
    trips = collections.OrderedDict()  # by trip_id

    with _open_file(input_dir_or_zip, trips_txt, skip_utf8_bom=True) as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            if ('direction_id' in row) and (row['direction_id'] not in ['0', '1']):
                logging.error('For trip_id={} invalid direction_id: {}.'.format(
                    row['trip_id'], row['direction_id']))
            else:
                if row['trip_id'] in trips:
                    logging.error('Duplicate trip_id={} in {}'.format(row['trip_id'], trips_txt))
                else:
                    # create new trip
                    trips[row['trip_id']] = {
                        'route_id': row['route_id'],
                        'service_id': row['service_id'],
                        'direction_id': row.get('direction_id', '-'),
                        'shape_id': row['shape_id'],
                        'stops': {},  # by stop_sequence
                        'stop_distances': [],  # point indexes in encoded shape
                        'dates': {
                            'start_date': None,
                            'end_date': None,
                            'weekdays': None,
                            'exception_dates': collections.OrderedDict([('added', []),
                                                                        ('removed', [])])
                        },
                        'times': {
                            'start_time': 0,  # number of minutes after midnight
                            'is_departure_times': False,
                            'stop_times': []  # arrival and departure times for each stop
                        },
                        'cache_indexes': {
                            'shape_i': None,
                            'stop_distances_i': None,
                            'stop_times_i': None,
                            'trip_dates_i': None,
                            'trip_group_i': None
                        },
                        'is_invalid': False
                    }

    logging.debug('parsed {} trips'.format(len(trips)))

    return trips


def _parse_calendar(input_dir_or_zip, calendar_txt):
    calendar_entries = {}
    if _is_file(input_dir_or_zip, calendar_txt):
        with _open_file(input_dir_or_zip, calendar_txt, skip_utf8_bom=True) as input_file:
            csv_reader = csv.DictReader(input_file)
            for row in csv_reader:
                if row['service_id'] in calendar_entries:
                    logging.error('duplicate service_id={} in calendar'.format(row['service_id']))
                else:
                    calendar_entries[row['service_id']] = {
                        'start_date': row['start_date'],
                        'end_date': row['end_date'],
                        'weekdays': _get_service_weekdays(row)
                    }

        logging.debug('parsed {} calendar entries'.format(len(calendar_entries)))

    return calendar_entries


def _get_service_weekdays(row):  # row in calendar.txt
    days = [row['monday'], row['tuesday'], row['wednesday'], row['thursday'], row['friday'],
            row['saturday'], row['sunday']]
    if ''.join(sorted(days)) == '0000001':  # exactly one weekday (HSL)
        return days.index('1')
    else:
        return ''.join(days)


def _parse_calendar_dates(input_dir_or_zip, calendar_dates_txt):
    calendar_dates = collections.OrderedDict()
    exception_types = {'1': 'added', '2': 'removed'}
    with _open_file(input_dir_or_zip, calendar_dates_txt, skip_utf8_bom=True) as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            if row['exception_type'] in exception_types:
                if not row['service_id'] in calendar_dates:
                    calendar_dates[row['service_id']] = {
                        'added': [],
                        'removed': []
                    }
                exception_type = exception_types[row['exception_type']]
                calendar_dates[row['service_id']][exception_type].append(row['date'])
            else:
                logging.error('For service_id={} invalid exception_type: {}.'.format(
                    row['service_id'], row['exception_type']))
    return calendar_dates


def _parse_stop_times(input_dir_or_zip, stop_times_txt):
    stop_time_trips = collections.OrderedDict()  # by trip_id
    is_seconds_in_time = False

    with _open_file(input_dir_or_zip, stop_times_txt, skip_utf8_bom=True) as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            if ':' not in row['arrival_time']:
                logging.info('Invalid arrival_time in {}.'.format(row))
                continue
            if not is_seconds_in_time:
                is_seconds_in_time = _is_seconds_in_time(row)
            if row['trip_id'] not in stop_time_trips:
                stop_time_trips[row['trip_id']] = {
                    'is_departure_times': False,
                    'start_time': None,
                    'stop_times': [],
                    'stops': {}
                }
            trip = stop_time_trips[row['trip_id']]
            if len(trip['stop_times']) == 0:
                trip['start_time'] = _get_minutes(row['arrival_time'])
            arrival_time = _get_minutes(row['arrival_time'])
            departure_time = _get_minutes(row['departure_time'])
            if _is_duplicate_stop_id(trip, row, arrival_time, departure_time):
                logging.info('Ignoring duplicate stop_id={} in trip_id={}.'.format(row['stop_id'],
                                                                                   row['trip_id']))
            else:
                trip['is_departure_times'] = (trip['is_departure_times'] or
                                              (arrival_time != departure_time))
                trip['stop_times'].append(arrival_time - trip['start_time'])
                trip['stop_times'].append(departure_time - trip['start_time'])
                _add_stop_to_stops(trip['stops'], row)
    _delete_invalid_stop_trip_times(stop_time_trips)
    return stop_time_trips


def _is_seconds_in_time(row):  # row in stop_times.txt
    for time_type in ['arrival_time', 'departure_time']:
        if not row[time_type].endswith(':00'):
            logging.info('Seconds in {}.'.format(time_type))
            return True
    return False


def _get_minutes(time_string):
    """Get number of minutes after midnight from HH:MM:SS time string."""
    (hours, minutes, seconds) = time_string.split(':')
    return (int(hours) * 60) + int(minutes) + _round(int(seconds) / 60.0)


def _round(number):
    if number > 0:
        return int(math.floor((number + 0.5)))
    else:
        return int(math.ceil((number - 0.5)))


def _is_duplicate_stop_id(trip, row, arrival_time, departure_time):  # row in stop_times.txt
    if (trip['stop_times'] and trip['stops']) and (arrival_time == departure_time):
        previous_stop_time = trip['stop_times'][-1]
        next_stop_time = arrival_time - trip['start_time']
        previous_stop_id = trip['stops'].get(int(row['stop_sequence']) - 1)
        if (next_stop_time == previous_stop_time) and (row['stop_id'] == previous_stop_id):
            return True
    return False


def _add_stop_to_stops(stops, row):  # row in stop_times.txt
    stop_sequence = int(row['stop_sequence'])
    if stop_sequence not in stops:
        stops[stop_sequence] = row['stop_id']
    else:
        if stops[stop_sequence] != row['stop_id']:
            logging.error('In trip_id={} two stops for stop_sequence={}: {} {}.'.format(
                row['trip_id'], stop_sequence, row['stop_id'],
                stops[stop_sequence]))


def _delete_invalid_stop_trip_times(stop_time_trips):
    invalid_trip_ids = []
    for trip_id in stop_time_trips:
        if _is_stop_times_invalid(trip_id, stop_time_trips[trip_id]['stop_times']):
            invalid_trip_ids.append(trip_id)
    for trip_id in invalid_trip_ids:
        del stop_time_trips[trip_id]


def _is_stop_times_invalid(trip_id, stop_times):
    if len(stop_times) < 4:
        reason = 'short'
        is_invalid = True
    elif stop_times != sorted(stop_times):
        reason = 'order'
        is_invalid = True
    elif _get_max_stop_time_gap(stop_times) > (8 * 60):  # 8 hours
        reason = 'gap'
        is_invalid = True
    else:
        is_invalid = False

    if is_invalid:
        msg_format = 'In trip_id={} invalid stop_times ({}): {}.'
        logging.error(msg_format.format(trip_id, reason, stop_times))

    return is_invalid


def _get_max_stop_time_gap(stop_times):
    max_gap = 0
    for i in range(1, len(stop_times)):
        max_gap = max(max_gap, stop_times[i] - stop_times[i - 1])
    return max_gap


def _add_dates_to_trips(trips, calendar_entries, calendar_dates):
    for trip_id in trips:
        service_id = trips[trip_id]['service_id']
        if (service_id not in calendar_entries) and (service_id not in calendar_dates):
            trips[trip_id]['is_invalid'] = True
            logging.error('No dates for trip_id={}/service_id={}.'.format(trip_id, service_id))
        else:
            dates = trips[trip_id]['dates']
            if service_id in calendar_entries:
                dates['start_date'] = calendar_entries[service_id]['start_date']
                dates['end_date'] = calendar_entries[service_id]['end_date']
                dates['weekdays'] = calendar_entries[service_id]['weekdays']
            if service_id in calendar_dates:
                dates['exception_dates']['added'] = calendar_dates[service_id]['added']
                dates['exception_dates']['removed'] = calendar_dates[service_id]['removed']


def _add_stop_times_to_trips(trips, stop_times):
    for trip_id in trips:
        if trip_id not in stop_times:
            trips[trip_id]['is_invalid'] = True
            logging.error('No stop times for trip_id={}.'.format(trip_id))
        else:
            trips[trip_id]['stops'] = stop_times[trip_id]['stops']
            times = trips[trip_id]['times']
            times['start_time'] = stop_times[trip_id]['start_time']
            times['is_departure_times'] = stop_times[trip_id]['is_departure_times']
            times['stop_times'] = stop_times[trip_id]['stop_times']


def _add_trips_to_routes(routes, trips):
    for trip_id in trips:
        route_id = trips[trip_id]['route_id']
        if route_id not in routes:
            logging.error('No route (route_id={}) for trip_id={}.'.format(route_id, trip_id))
        else:
            trip = trips[trip_id]
            if trip['is_invalid'] is False:
                routes[route_id]['trips'][trip_id] = trip
                if trip['times']['is_departure_times']:
                    routes[route_id]['is_departure_times'] = True


def _add_shapes_to_routes(routes, shapes, stops):
    stats = {'shapes': 0, 'points': 0, 'dropped_points': 0, 'bytes': 0}

    for route in routes.values():
        cache = {}
        for trip_id in route['trips']:
            trip = route['trips'][trip_id]
            if _is_shape_ok(route, trip, shapes):
                cache_key = tuple(sorted(trip['stops'].items()))
                if cache_key in cache:
                    trip['stop_distances'] = cache[cache_key]['stop_distances']
                    trip['cache_indexes']['shape_i'] = cache[cache_key]['shape_i']
                else:
                    shape = shapes[trip['shape_id']]['points']
                    stop_distances = _get_stop_distances(shape, trip['stops'], stops)
                    if _is_shape_long_enough(route, trip_id, shape, stop_distances, stops):
                        _add_shape_to_route(route, trip, shape, stop_distances, stats)
                        cache[cache_key] = {
                            'shape_i': trip['cache_indexes']['shape_i'],
                            'stop_distances': trip['stop_distances']}
                    else:
                        trip['is_invalid'] = True
            else:
                trip['is_invalid'] = True

    logging.debug('shape encoding stats: {}'.format(stats))


def _is_shape_ok(route, trip, shapes):
    if trip['shape_id'] not in shapes:
        logging.error('No shape information for shape_id={} in route={}.'.format(
            trip['shape_id'], route['long_name']))
        trip['shape_id'] = None
        return False
    elif shapes[trip['shape_id']]['is_invalid']:
        logging.error('Invalid shape_id={} in route={}.'.format(
            trip['shape_id'], route['long_name']))
        trip['shape_id'] = None
        return False
    else:
        return True


def _get_stop_distances(shape, trip_stops, stops):
    stop_distances = []

    for _, stop_id in sorted(trip_stops.items()):
        if stop_id not in stops:
            logging.error('No stop information for stop_id={}.'.format(stop_id))
        else:
            if len(stop_distances) == 0:
                previous_index = 0
            else:
                previous_index = stop_distances[-1]
            point_index = polyline.get_point_index(shape, stops[stop_id], previous_index)
            stop_distances.append(point_index)

    return stop_distances


def _is_shape_long_enough(route, trip_id, shape, stop_distances, stops):
    trip = route['trips'][trip_id]
    if len(shape) < len(stop_distances):
        unique_stops = _count_unique_stops_in_trip(trip['stops'], stops)
        id_msg = 'In trip_id={} (route={}/{}/{})'.format(trip_id, route['name'], route['long_name'],
                                                         route['route_id'])
        if unique_stops < len(stop_distances):
            msg = '{} less unique stops than stops: {} < {}'
            logging.info(msg.format(id_msg, unique_stops, len(stop_distances)))
        if len(shape) < unique_stops:
            msg = '{} less points in shape ({}) than unique stops: {} < {}'
            logging.error(msg.format(id_msg, trip['shape_id'], len(shape), unique_stops))
            return False
    return True


def _count_unique_stops_in_trip(trip_stops, stops):
    unique_stops = 0
    previous_stop = None
    for _, stop_id in sorted(trip_stops.items()):
        if stop_id in stops:
            if stops[stop_id] != previous_stop:
                unique_stops += 1
            previous_stop = stops[stop_id]
    return unique_stops


def _add_shape_to_route(route, trip, shape, stop_distances, stats):
    encoded_shape = polyline.encode(shape, stop_distances, very_small=0.00002)
    trip['stop_distances'] = encoded_shape['fixed_indexes']
    if encoded_shape['points'] in route['shapes']:
        logging.info('Duplicate shape encoding for route={}.'.format(route['long_name']))
        trip['cache_indexes']['shape_i'] = route['shapes'].index(encoded_shape['points'])
    else:
        route['shapes'].append(encoded_shape['points'])
        trip['cache_indexes']['shape_i'] = len(route['shapes']) - 1
        stats['shapes'] += 1
        stats['points'] += len(shape)
        stats['dropped_points'] += encoded_shape['num_dropped_points']
        stats['bytes'] += len(encoded_shape['points'])


def _delete_invalid_trips(routes):
    for route in routes.values():
        invalid_trip_ids = set()
        for trip_id in route['trips']:
            if route['trips'][trip_id]['is_invalid']:
                invalid_trip_ids.add(trip_id)
        for trip_id in invalid_trip_ids:
            del route['trips'][trip_id]


def _delete_invalid_routes(routes):
    invalid_route_ids = set()
    for route_id in routes:
        if len(routes[route_id]['trips']) == 0:
            invalid_route_ids.add(route_id)
            logging.info('Deleted route_id={} ({}) with no trips.'.format(
                route_id, routes[route_id]['long_name']))
    for route_id in invalid_route_ids:
        del routes[route_id]


def get_modification_time(input_dir_or_zip):
    """Get time of most recent content modification as seconds since the epoch."""
    path = 'routes.txt'
    if os.path.isdir(input_dir_or_zip):
        return int(os.stat(os.path.join(input_dir_or_zip, path)).st_mtime)
    else:
        with zipfile.ZipFile(input_dir_or_zip) as zip_file:
            modified_dt = datetime.datetime(*zip_file.getinfo(path).date_time)
            return int(time.mktime(modified_dt.timetuple()))
