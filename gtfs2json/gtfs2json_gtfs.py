#!/usr/bin/env python

"""Parse GTFS files.

General Transit Feed Specification Reference: https://developers.google.com/transit/gtfs/reference

Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html
"""

import csv
import logging
import os

import polyline


def get_routes(input_dir):
    """Parse GTFS files into dict of routes."""
    print 'parsing shapes...'
    shapes = _parse_shapes(os.path.join(input_dir, 'shapes.txt'))
    print 'parsing stops...'
    stops = _parse_stops(os.path.join(input_dir, 'stops.txt'))
    print 'parsing routes...'
    routes = _parse_routes(os.path.join(input_dir, 'routes.txt'))
    print 'adding services and trips to routes...'
    _add_services_trips_to_routes(routes, os.path.join(input_dir, 'trips.txt'))
    print 'adding calendar to services...'
    _add_calendar_to_services(routes, os.path.join(input_dir, 'calendar.txt'))
    print 'adding calendar dates to services...'
    _add_calendar_dates_to_services(routes, os.path.join(input_dir, 'calendar_dates.txt'))
    print 'adding stop times to trips...'
    _add_stop_times_to_trips(routes, os.path.join(input_dir, 'stop_times.txt'))
    print 'adding shapes to routes...'
    _add_shapes_to_routes(routes, shapes, stops)

    return routes


def _parse_shapes(shapes_txt):
    shapes = {}

    with open(shapes_txt, 'r') as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            if row['shape_id'] not in shapes:
                shapes[row['shape_id']] = []
            point = (float(row['shape_pt_lat']), float(row['shape_pt_lon']))
            shapes[row['shape_id']].append(point)

    logging.debug('parsed {} shapes'.format(len(shapes)))

    return shapes


def _parse_stops(stops_txt):
    stops = {}

    with open(stops_txt, 'r') as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            stops[row['stop_id']] = (float(row['stop_lat']), float(row['stop_lon']))

    logging.debug('parsed {} stops'.format(len(stops)))

    return stops


def _parse_routes(routes_txt):
    routes = {}  # by route_id
    # 109: https://github.com/HSLdevcom/kalkati2gtfs/commit/d4758fb74d7455ddbf4032175ef8ff51c587ec7f
    route_types = {'0': 'tram', '1': 'metro', '3': 'bus', '4': 'ferry', '109': 'train',
                   '2': 'train', '704': 'bus', '1104': 'airplane'}

    with open(routes_txt, 'r') as input_file:
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
                'services': {},  # by service_id
                'shapes': []
            }

    logging.debug('parsed {} routes'.format(len(routes)))

    return routes


def _get_route_name(row):  # row in routes.txt
    if row['route_short_name'] != '':
        return row['route_short_name']
    else:
        return row['route_id']  # metro routes do not have short names


def _add_services_trips_to_routes(routes, trips_txt):
    with open(trips_txt, 'r') as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            if row['route_id'] not in routes:
                logging.error('No route information for route_id={}'.format(row['route_id']))
            elif ('direction_id' in row) and (row['direction_id'] not in ['0', '1']):
                logging.error('For route_id={} invalid direction_id: {}'.format(
                    row['route_id'], row['direction_id']))
            else:
                _add_services_trips_to_route(routes[row['route_id']], row)

    return routes


def _add_services_trips_to_route(route, row):  # row in trips.txt
    # route contains services, service contains trips

    if row['service_id'] not in route['services']:
        # create new service
        route['services'][row['service_id']] = {
            'start_date': None,
            'end_date': None,
            'weekday': None,
            'exception_dates': {'added': [], 'removed': []},
            'trips': {},  # by trip_id
            'directions_i': None,
            'directions': {'0': _create_direction(), '1': _create_direction()}
        }
    service = route['services'][row['service_id']]
    if row['trip_id'] in service['trips']:
        logging.error('In route_id={} service_id={} duplicate trip_id: {}'.format(
            row['route_id'], row['service_id'], row['trip_id']))
    else:
        # create new trip
        direction_id = row.get('direction_id', '0')
        service['trips'][row['trip_id']] = {
            'route_id': row['route_id'],
            'service_id': row['service_id'],
            'direction_id': direction_id,
            'start_time': 0,  # number of minutes after midnight
            'is_departure_times': False,
            'stop_times': [],  # arrival and departure times for each stop
            'stop_times_i': None
        }
        _add_shape_id_to_direction(service['directions'][direction_id], row)


def _create_direction():
    return {
        'shape_id': None,
        'shape_i': None,
        'stops': {},  # by stop_sequence
        'stop_distances': []  # point indexes in encoded shape
    }


def _add_shape_id_to_direction(direction, row):  # row in trips.txt
    if direction['shape_id'] and (row['shape_id'] != direction['shape_id']):
        logging.error('In service_id={} duplicate shape_id: {}'.format(
            row['service_id'], row['shape_id']))

    direction['shape_id'] = row['shape_id']


def _add_calendar_to_services(routes, calendar_txt):
    services = _get_services(routes)

    with open(calendar_txt, 'r') as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            if row['service_id'] in services:
                for service in services[row['service_id']]:
                    if service['start_date']:
                        logging.error('duplicate service_id={} in calendar'.format(
                            row['service_id']))
                    service['start_date'] = row['start_date']
                    service['end_date'] = row['end_date']
                    service['weekday'] = _get_service_weekday(row)


def _get_services(routes):
    services = {}
    for route in routes.itervalues():
        for service_id, service in route['services'].iteritems():
            if service_id not in services:
                services[service_id] = []
            services[service_id].append(service)
    return services


def _get_service_weekday(row):  # row in calendar.txt
    days = [row['monday'], row['tuesday'], row['wednesday'], row['thursday'], row['friday'],
            row['saturday'], row['sunday']]
    if ''.join(sorted(days)) == '0000001':  # exactly one weekday (HSL)
        return days.index('1')
    else:
        return ''.join(days)


def _add_calendar_dates_to_services(routes, calendar_dates_txt):
    services = _get_services(routes)

    with open(calendar_dates_txt, 'r') as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            if row['service_id'] in services:
                for service in services[row['service_id']]:
                    _add_calendar_dates_to_service(service, row)


def _add_calendar_dates_to_service(service, row):   # row in calendar_dates_txt
    exception_types = {'1': 'added', '2': 'removed'}
    if row['exception_type'] in exception_types:
        if (row['date'] < service['start_date']) or (row['date'] > service['end_date']):
            logging.error('For service_id={} invalid exception date: {}'.format(
                row['service_id'], row['date']))
        else:
            exception_type = exception_types[row['exception_type']]
            service['exception_dates'][exception_type].append(row['date'])
    else:
        logging.error('For service_id={} invalid exception_type: {}'.format(
            row['service_id'], row['exception_type']))


def _add_stop_times_to_trips(routes, stop_times_txt):
    """Add stops to services and stop times (and start time) to trips."""
    trips = _get_trips(routes)
    is_seconds_in_time = False

    with open(stop_times_txt, 'r') as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            if not is_seconds_in_time:
                is_seconds_in_time = _is_seconds_in_time(row)
            if row['trip_id'] not in trips:
                logging.error('No trip information for trip_id={}'.format(row['trip_id']))
            else:
                trip = trips[row['trip_id']]
                if len(trip['stop_times']) == 0:
                    trip['start_time'] = _get_minutes(row['arrival_time'])
                _add_stop_times_to_trip(trip, row)
                service = routes[trip['route_id']]['services'][trip['service_id']]
                _add_stop_to_stops(service['directions'][trip['direction_id']]['stops'], row)

    _delete_invalid_trips(routes, trips)


def _get_trips(routes):
    trips = {}
    for route in routes.itervalues():
        for service in route['services'].itervalues():
            for trip_id, trip in service['trips'].iteritems():
                trips[trip_id] = trip
    return trips


def _is_seconds_in_time(row):  # row in stop_times.txt
    for time_type in ['arrival_time', 'departure_time']:
        if not row[time_type].endswith(':00'):
            logging.info('Seconds in {}.'.format(time_type))
            return True
    return False


def _get_minutes(time_string):
    """Get number of minutes after midnight from HH:MM:SS time string."""
    (hours, minutes, seconds) = time_string.split(':')
    return (int(hours) * 60) + int(minutes) + int(round(int(seconds) / 60.0))


def _add_stop_times_to_trip(trip, row):  # row in stop_times.txt
    arrival_time = _get_minutes(row['arrival_time'])
    departure_time = _get_minutes(row['departure_time'])
    trip['is_departure_times'] = trip['is_departure_times'] or (arrival_time != departure_time)
    trip['stop_times'].append(arrival_time - trip['start_time'])
    trip['stop_times'].append(departure_time - trip['start_time'])


def _add_stop_to_stops(stops, row):  # row in stop_times.txt
    stop_sequence = int(row['stop_sequence'])
    if stop_sequence not in stops:
        stops[stop_sequence] = row['stop_id']
    else:
        if stops[stop_sequence] != row['stop_id']:
            logging.error('In trip_id={} two stops for stop_sequence={}: {} {} '.format(
                row['trip_id'], stop_sequence, row['stop_id'],
                stops[stop_sequence]))


def _delete_invalid_trips(routes, trips):
    for trip_id in trips:
        trip = trips[trip_id]
        if _is_trip_invalid(trip_id, trip):
            route = routes[trip['route_id']]
            service = route['services'][trip['service_id']]
            del service['trips'][trip_id]
            logging.info('Deleted trip_id={} as invalid.'.format(trip_id))
            if len(service['trips']) == 0:
                del route['services'][trip['service_id']]
                logging.info('Deleted service_id={}/route_id={} with no trips'.format(
                    trip['service_id'], trip['route_id']))


def _is_trip_invalid(trip_id, trip):
    if len(trip['stop_times']) < 4:
        reason = 'short'
        is_invalid = True
    elif trip['stop_times'] != sorted(trip['stop_times']):
        reason = 'order'
        is_invalid = True
    elif _get_max_stop_time_gap(trip['stop_times']) > (8 * 60):  # 8 hours
        reason = 'gap'
        is_invalid = True
    else:
        is_invalid = False

    if is_invalid:
        msg_format = 'In trip_id={}/service_id={}/route_id={} invalid stop_times ({}): {}'
        logging.error(msg_format.format(
            trip_id, trip['service_id'], trip['route_id'], reason, trip['stop_times']))

    return is_invalid


def _get_max_stop_time_gap(stop_times):
    max_gap = 0
    for i in range(1, len(stop_times)):
        max_gap = max(max_gap, stop_times[i] - stop_times[i - 1])
    return max_gap


def _add_shapes_to_routes(routes, shapes, stops):
    stats = {'shapes': 0, 'points': 0, 'dropped_points': 0, 'bytes': 0}

    for route in routes.itervalues():
        direction_cache = {}
        for service in route['services'].itervalues():
            for direction in service['directions'].itervalues():
                if direction['shape_id']:  # some services operate only in one direction
                    cache_key = tuple(sorted(direction['stops'].items()))
                    if cache_key in direction_cache:
                        direction['stop_distances'] = direction_cache[cache_key]['stop_distances']
                        direction['shape_i'] = direction_cache[cache_key]['shape_i']
                    else:
                        if direction['shape_id'] in shapes:
                            shape = shapes[direction['shape_id']]
                            stop_distances = _get_stop_distances(shape, direction['stops'], stops)
                            _add_shape_to_route(route, direction, shape, stop_distances, stats)
                            direction_cache[cache_key] = {
                                'shape_i': direction['shape_i'],
                                'stop_distances': direction['stop_distances']}
                        else:
                            logging.error('No shape information for shape_id={}'.format(
                                direction['shape_id']))

    logging.debug('shape encoding stats: {}'.format(stats))


def _get_stop_distances(shape, direction_stops, stops):
    stop_distances = []

    for _, stop_id in sorted(direction_stops.iteritems()):
        if stop_id not in stops:
            logging.error('No stop information for stop_id={}'.format(stop_id))
        else:
            if len(stop_distances) == 0:
                previous_index = 0
            else:
                previous_index = stop_distances[-1]
            point_index = polyline.get_point_index(shape, stops[stop_id], previous_index)
            stop_distances.append(point_index)

    return stop_distances


def _add_shape_to_route(route, direction, shape, stop_distances, stats):
    if len(shape) < len(stop_distances):
        logging.error('In route {} less points in shape than stops: {} < {}'.format(
            route['name'], len(shape), len(stop_distances)))
        return
    encoded_shape = polyline.encode(shape, stop_distances, very_small=0.00002)
    direction['stop_distances'] = encoded_shape['fixed_indexes']
    if encoded_shape['points'] in route['shapes']:
        logging.error('Duplicate shape encoding for route {}'.format(route['name']))
    else:
        route['shapes'].append(encoded_shape['points'])
        direction['shape_i'] = len(route['shapes']) - 1
        stats['shapes'] += 1
        stats['points'] += len(shape)
        stats['dropped_points'] += encoded_shape['num_dropped_points']
        stats['bytes'] += len(encoded_shape['points'])


def get_modification_time(input_dir):
    """Get time of most recent content modification as seconds since the epoch."""
    return int(os.stat(os.path.join(input_dir, 'routes.txt')).st_mtime)
