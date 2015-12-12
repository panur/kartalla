#!/usr/bin/env python

"""Convert HSL GTFS files into JSON."""

import argparse
import csv
import json
import logging
import os
import resource
import sys

import polyline


def _main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input_dir', help='GTFS input directory')
    parser.add_argument('output_file', help='JSON output file')
    args = parser.parse_args()

    _init_logging()

    logging.debug('started {}'.format(sys.argv))

    print 'parsing shapes...'
    shapes = _parse_shapes(os.path.join(args.input_dir, 'shapes.txt'))
    print 'parsing stops...'
    stops = _parse_stops(os.path.join(args.input_dir, 'stops.txt'))
    print 'parsing routes...'
    routes = _parse_routes(os.path.join(args.input_dir, 'routes.txt'))
    print 'adding services and trips to routes...'
    _add_services_trips_to_routes(routes, os.path.join(args.input_dir, 'trips.txt'))
    print 'adding calendar to services...'
    _add_calendar_to_services(routes, os.path.join(args.input_dir, 'calendar.txt'))
    print 'adding calendar dates to services...'
    _add_calendar_dates_to_services(routes, os.path.join(args.input_dir, 'calendar_dates.txt'))
    print 'adding stop times to trips...'
    # _add_stop_times_to_trips(routes, os.path.join(args.input_dir, 'stop_times.txt'))
    _add_stop_times_to_trips(routes, os.path.join(args.input_dir, '2132_stop_times.txt'))
    print 'adding shapes to routes...'
    _add_shapes_to_routes(routes, shapes, stops)
    print 'creating output file...'
    _create_output_file(routes, args.output_file)

    print 'max mem: {} megabytes'.format(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)


def _init_logging():
    log_format = '%(asctime)s %(levelname)s %(filename)s:%(lineno)d %(funcName)s: %(message)s'
    logging.basicConfig(filename='gtfs2json.log', format=log_format, level=logging.DEBUG)


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
    routes = {}
    # tbd: is 109 some hsl hack?
    route_types = {'0': 'tram', '1': 'metro', '3': 'bus', '4': 'ferry', '109': 'train'}

    with open(routes_txt, 'r') as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            if row['route_type'] not in route_types:
                logging.error('In route_id={} route_type {} not in {}'.format(
                    row['route_id'], row['route_type'], route_types))
            # create new route
            routes[row['route_id']] = {
                'route_id': row['route_id'],
                'name': row['route_short_name'],
                'type': route_types.get(row['route_type'], row['route_type']),
                'services': {},  # by service_id
                'shapes': []
            }

    logging.debug('parsed {} routes'.format(len(routes)))

    return routes


def _add_services_trips_to_routes(routes, trips_txt):
    with open(trips_txt, 'r') as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            if row['route_id'] not in routes:
                logging.error('No route information for route_id={}'.format(row['route_id']))
            elif row['direction_id'] not in ['0', '1']:
                logging.error('For route_id={} invalid direction_id: {}'.format(
                    row['route_id'], row['direction_id']))
            else:
                _add_services_trips_to_route(routes[row['route_id']], row)

    return routes


def _add_services_trips_to_route(route, row):  # row in trips.txt
    # tbd: validate shape_id
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
        service['trips'][row['trip_id']] = {
            'route_id': row['route_id'],
            'service_id': row['service_id'],
            'direction_id': row['direction_id'],
            'start_time': 0,  # number of minutes after midnight
            'is_departure_times': False,
            'stop_times': [],
            'stop_times_i': None
        }
        _add_shape_id_to_direction(service['directions'][row['direction_id']], row)


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
                service = services[row['service_id']]
                if service['start_date']:
                    logging.error('duplicate service_id={} in calendar'.format(row['service_id']))
                service['start_date'] = row['start_date']
                service['end_date'] = row['end_date']
                service['weekday'] = _get_service_weekday(row['service_id'], row)


def _get_services(routes):
    services = {}
    for route in routes.itervalues():
        for service_id, service in route['services'].iteritems():
            services[service_id] = service
    return services


def _get_service_weekday(service_id, row):  # row in calendar.txt
    days = [row['monday'], row['tuesday'], row['wednesday'], row['thursday'], row['friday'],
            row['saturday'], row['sunday']]
    if ''.join(sorted(days)) != '0000001':
        logging.error('For service_id={} invalid week days: {}'.format(service_id, days))
    return days.index('1')


def _add_calendar_dates_to_services(routes, calendar_dates_txt):
    services = _get_services(routes)

    with open(calendar_dates_txt, 'r') as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            if row['service_id'] in services:
                exception_types = {'1': 'added', '2': 'removed'}
                if row['exception_type'] in exception_types:  # tbd: check start/end
                    exception_dates = services[row['service_id']]['exception_dates']
                    exception_type = exception_types[row['exception_type']]
                    exception_dates[exception_type].append(row['date'])
                else:
                    logging.error('For service_id={} invalid exception_type: {}'.format(
                        row['service_id'], row['exception_type']))


def _add_stop_times_to_trips(routes, stop_times_txt):
    """Add stops to services and stop times (and start time) to trips."""
    trips = _get_trips(routes)

    with open(stop_times_txt, 'r') as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            _check_stops_times_input_row(row)
            if row['trip_id'] not in trips:
                logging.error('No trip information for trip_id={}'.format(row['trip_id']))
            else:
                trip = trips[row['trip_id']]
                if len(trip['stop_times']) == 0:
                    trip['start_time'] = _get_minutes(row['arrival_time'])
                _add_stop_times_to_trip(trip, row)
                service = routes[trip['route_id']]['services'][trip['service_id']]
                _add_stop_to_stops(service['directions'][trip['direction_id']]['stops'], row)


def _get_trips(routes):
    trips = {}
    for route in routes.itervalues():
        for service in route['services'].itervalues():
            for trip_id, trip in service['trips'].iteritems():
                trips[trip_id] = trip
    return trips


def _check_stops_times_input_row(row):
    """Check the row in stop_times.txt matches expectations."""
    if not row['arrival_time'].endswith(':00'):
        logging.error('In trip_id={} seconds in arrival_time: {}'.format(
            row['trip_id'], row['arrival_time']))


def _get_minutes(time_string):
    """Get number of minutes after midnight from HH:MM:SS time string."""
    (hours, minutes) = time_string.split(':')[0:2]
    return (int(hours) * 60) + int(minutes)


def _add_stop_times_to_trip(trip, row):  # row in stop_times.txt
    arrival_time = _get_minutes(row['arrival_time'])
    departure_time = _get_minutes(row['departure_time'])
    if departure_time < arrival_time:
        logging.error('In service_id= {} departure_time < arrival_time: {} < {}'.format(
            trip['service_id'], row['departure_time'], row['arrival_time']))
    trip['is_departure_times'] = trip['is_departure_times'] or (arrival_time != departure_time)
    trip['stop_times'].append(arrival_time - trip['start_time'])
    trip['stop_times'].append(departure_time - trip['start_time'])


def _add_stop_to_stops(stops, row):  # row in stop_times.txt
    # tbd: validate stop_sequence
    stop_sequence = int(row['stop_sequence'])
    if stop_sequence not in stops:
        stops[stop_sequence] = row['stop_id']
    else:
        if stops[stop_sequence] != row['stop_id']:
            logging.error('In trip_id={} two stops for stop_sequence={}: {} {} '.format(
                row['trip_id'], stop_sequence, row['stop_id'],
                stops[stop_sequence]))


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
                        shape = shapes[direction['shape_id']]
                        stop_distances = _get_stop_distances(shape, direction['stops'], stops)
                        _add_shape_to_route(route, direction, shape, stop_distances, stats)
                        direction_cache[cache_key] = {'shape_i': direction['shape_i'],
                                                      'stop_distances': direction['stop_distances']}

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
            point_index = _get_point_index(shape, stops[stop_id], previous_index)
            stop_distances.append(point_index)

    return stop_distances


def _get_point_index(points, point, previous_index):
    for i in range(previous_index, len(points)):
        if points[i] == point:
            return i
    logging.error('No point index for {}'.format(point))


def _add_shape_to_route(route, direction, shape, stop_distances, stats):
    encoded_shape = polyline.encode(shape, stop_distances)
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


def _create_output_file(routes, output_filename):
    output_dates = _get_output_dates(routes)
    output_routes = _get_output_routes(output_dates, routes)

    output_data = []  # 0=dates, 1=routes
    output_data.append(output_dates)
    output_data.append(output_routes)

    with open(output_filename, 'w') as output_file:
        output_file.write(json.dumps(output_data, separators=(',', ':')))


def _get_output_dates(routes):
    output_dates = {}
    for route in routes.itervalues():
        for service in route['services'].itervalues():
            dates = [service['start_date'], service['end_date']]
            for exception_dates in service['exception_dates'].itervalues():
                dates = dates + exception_dates
            for date in dates:
                if date not in output_dates:
                    output_dates[date] = 0
                output_dates[date] += 1

    return sorted(output_dates, key=output_dates.get, reverse=True)


def _get_output_routes(output_dates, routes):
    output_routes = []
    stats = {'route_ids': len(routes), 'service_ids': 0, 'trip_ids': 0, 'shapes': 0,
             'directions': 0, 'stop_times': 0}

    for route_id in sorted(routes):
        route = routes[route_id]
        output_directions = _get_output_directions(route['services'])
        output_services = _get_output_services(route['services'], output_dates)
        output_route = []  # 0=name, 1=type, 2=shapes, 3=directions, 4=services
        output_route.append(route['name'])
        output_route.append(route['type'])
        output_route.append(route['shapes'])
        output_route.append(output_directions['directions'])
        output_route.append(output_services)
        output_routes.append(output_route)
        stats['service_ids'] += len(route['services'])
        stats['trip_ids'] += output_directions['stats']['trip_ids']
        stats['stop_times'] += output_directions['stats']['stop_times']
        stats['shapes'] += len(route['shapes'])
        stats['directions'] += len(output_directions['directions'])

    logging.debug('output stats: {}'.format(stats))

    return output_routes


def _get_output_directions(services):
    output = {'directions': [], 'stats': {'trip_ids': 0, 'stop_times': 0}}

    for _, service in sorted(services.iteritems()):
        output['stats']['trip_ids'] += len(service['trips'])
        output_directions = [None, None]
        for direction_id, direction in sorted(service['directions'].iteritems()):
            output_direction = _get_output_direction(service, direction_id, direction,
                                                     output['stats'])
            output_directions[int(direction_id)] = output_direction
        try:
            service['directions_i'] = output['directions'].index(output_directions)
        except ValueError:
            output['directions'].append(output_directions)
            service['directions_i'] = len(output['directions']) - 1

    return output


def _get_output_direction(service, direction_id, direction, stats):
    delta_stop_distances = _get_delta_list(direction['stop_distances'])
    output_stop_distances = _integer_list_to_string(delta_stop_distances)
    is_departure_times = _is_departure_times_in_service(service)
    output_stop_times = _get_service_stop_times(service, direction_id, is_departure_times)
    stats['stop_times'] += len(output_stop_times)
    # stop times must be set before these
    output_trips = _get_output_trips(service['trips'], direction_id)
    # 0=shape_i, 1=stop_distances, 2=is_departure_times, 3=stop_times, 4=trips
    output_direction = []
    output_direction.append(direction['shape_i'])
    output_direction.append(output_stop_distances)
    output_direction.append(int(is_departure_times))
    output_direction.append(output_stop_times)
    output_direction.append(output_trips)
    return output_direction


def _get_output_services(services, output_dates):
    output_services = []

    for _, service in sorted(services.iteritems()):
        # 0=start_date_i, 1=end_date_i, 2=weekday, 3=exception_dates, 4=directions_i
        output_service = []
        output_service.append(output_dates.index(service['start_date']))
        output_service.append(output_dates.index(service['end_date']))
        output_service.append(service['weekday'])
        output_service.append(_get_output_exception_dates(service['exception_dates'], output_dates))
        output_service.append(service['directions_i'])
        output_services.append(output_service)

    return output_services


def _get_output_exception_dates(exception_dates, output_dates):
    output_exception_dates = [[], []]  # 0=added, 1=removed
    for i, exception_type in enumerate(sorted(exception_dates)):
        for exception_date in exception_dates[exception_type]:
            output_exception_dates[i].append(output_dates.index(exception_date))
    return output_exception_dates


def _is_departure_times_in_service(service):
    for trip in service['trips'].itervalues():
        if trip['is_departure_times']:
            return True
    return False


def _get_service_stop_times(service, direction_id, is_departure_times):
    service_stop_times = []

    for _, trip in sorted(service['trips'].iteritems()):
        if trip['direction_id'] == direction_id:
            trip_stop_times = _get_trip_stop_times(trip['stop_times'], is_departure_times)
            delta_stop_times = _integer_list_to_string(_get_delta_list(trip_stop_times))
            try:
                trip['stop_times_i'] = service_stop_times.index(delta_stop_times)
            except ValueError:
                service_stop_times.append(delta_stop_times)
                trip['stop_times_i'] = len(service_stop_times) - 1

    return service_stop_times


def _get_trip_stop_times(stop_times, is_departure_times):
    if is_departure_times:
        return stop_times  # get both arrival and departure times
    else:
        return [t for i, t in enumerate(stop_times) if (i % 2) == 0]  # get only arrival times


def _get_delta_list(integer_list):
    """For [0, 10, 11, 22, 25] return [10, 1, 11, 3]."""
    if (len(integer_list) > 0) and (integer_list[0] != 0):
        raise SystemExit('integer_list[0] = {} != 0'.format(integer_list[0]))
    if integer_list != sorted(integer_list):
        raise SystemExit('integer_list not sorted: {}'.format(integer_list))
    return [(integer_list[i] - integer_list[i - 1]) for i in range(1, len(integer_list))]


def _integer_list_to_string(integer_list):
    """For [0, 1, 2, 14, 91, 92, 15, 182, 183, 16] return '#$%1~!$2!~!!$3'."""
    if (len(integer_list) > 0) and (min(integer_list) < 0):
        raise SystemExit('negative value in integer_list: {}'.format(integer_list))
    mult_chr = 33  # 33='!'
    min_chr = 35  # 35='#', not 34='"' because it takes three characters in JSON
    max_chr = 126  # 126='~'
    max_value = max_chr - min_chr
    output_string = ''
    for integer in integer_list:
        num_mult_chr = max(0, integer - 1) / max_value
        last_output_chr = chr(min_chr + (integer - (num_mult_chr * max_value)))
        output_string += (chr(mult_chr) * num_mult_chr) + last_output_chr
    return output_string


def _get_output_trips(trips, direction_id):
    start_times = []
    stop_times_indexes = []

    for _, trip in sorted(trips.iteritems()):
        if trip['direction_id'] == direction_id:
            start_times.append(trip['start_time'])
            stop_times_indexes.append(trip['stop_times_i'])

    if len(start_times) == 0:  # some services operate only in one direction
        return [[], [], []]
    else:
        delta_start_times = _integer_list_to_string(_get_delta_list([0] + start_times)[1:])
        return [start_times[0], delta_start_times, _integer_list_to_string(stop_times_indexes)]


if __name__ == "__main__":
    _main()
