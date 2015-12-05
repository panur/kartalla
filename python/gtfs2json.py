#!/usr/bin/env python

"""Convert HSL GTFS files into JSON files."""

import argparse
import csv
import json
import logging
import os
import resource
import sys

import gpolyencode


def _main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input_dir', help='GTFS input directory')
    parser.add_argument('output_dir', help='JSON output directory')
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
    print 'adding stop times to trips...'
    # _add_stop_times_to_trips(routes, os.path.join(args.input_dir, 'stop_times.txt'))
    _add_stop_times_to_trips(routes, os.path.join(args.input_dir, '2132_stop_times.txt'))
    print 'adding stop distances to services...'
    _add_stop_distances_to_services(routes, shapes, stops)
    # tbd: encode only shapes in use
    print 'encoding shapes...'
    _encode_shapes(shapes)
    print 'writing routes to file...'
    _write_routes_to_file(shapes, routes, os.path.join(args.output_dir, 'routes.json'))

    print 'max mem: {}'.format(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)


def _init_logging():
    log_format = '%(asctime)s %(levelname)s %(filename)s:%(lineno)d %(funcName)s: %(message)s'
    logging.basicConfig(filename='gtfs2json.log', format=log_format, level=logging.DEBUG)


def _parse_shapes(input_filename):
    shapes = {}

    with open(input_filename, 'r') as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            if row['shape_id'] not in shapes:
                shapes[row['shape_id']] = []
            point = (float(row['shape_pt_lon']), float(row['shape_pt_lat']))
            shapes[row['shape_id']].append(point)

    logging.debug('parsed {} shapes'.format(len(shapes)))

    return shapes


def _encode_shapes(shapes):
    encoder = gpolyencode.GPolyEncoder()
    size_stats = {'min': (1000, None), 'max': (0, None), 'total': 0}

    for shape_id in shapes:
        encoder_output = encoder.encode(shapes[shape_id])
        shapes[shape_id] = encoder_output['points'].replace("\\", "\\\\")
        size = len(shapes[shape_id])
        size_stats['total'] += size
        if size < size_stats['min'][0]:
            size_stats['min'] = (size, shape_id)
        if size > size_stats['max'][0]:
            size_stats['max'] = (size, shape_id)

    logging.debug('encoded shapes size_stats: {}'.format(size_stats))


def _parse_stops(stops_txt):
    stops = {}

    with open(stops_txt, 'r') as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            stops[row['stop_id']] = (float(row['stop_lon']), float(row['stop_lat']))

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
                logging.error('in route_id={} route_type {} not in {}'.format(
                    row['route_id'], row['route_type'], route_types))
            # create new route
            routes[row['route_id']] = {'route_id': row['route_id'],
                                       'name': row['route_short_name'],
                                       'type': route_types.get(row['route_type'],
                                                               row['route_type']),
                                       'services': {},
                                       'shapes': []}

    logging.debug('parsed {} routes'.format(len(routes)))

    return routes


def _add_services_trips_to_routes(routes, trips_txt):
    with open(trips_txt, 'r') as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            if row['route_id'] not in routes:
                logging.error('No route information for route_id={}'.format(row['route_id']))
            else:
                _add_services_trips_to_route(routes[row['route_id']], row)

    # logging.debug('huppa: {}'.format(routes['2132']))

    return routes


def _add_services_trips_to_route(route, row):  # row in trips.txt
    # tbd: validate direction_id, shape_id
    # route contains services, service contains trips

    if row['service_id'] not in route['services']:
        # create new service
        route['services'][row['service_id']] = {
            'shape_id': {'0': None, '1': None},
            'shape_i': {'0': None, '1': None},
            'trips': {},
            'stops': {'0': {}, '1': {}},
            'stop_distances': {'0': [], '1': []}}  # shape indexes
    service = route['services'][row['service_id']]
    if row['trip_id'] in service['trips']:
        logging.error('in route_id={} service_id={} duplicate trip_id: {}'.format(
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
            'stop_times_i': None}

        if (service['shape_id'][row['direction_id']] and
                (row['shape_id'] != service['shape_id'][row['direction_id']])):
            logging.error('in service_id={} duplicate shape_id: {}'.format(
                row['service_id'], row['shape_id']))

        service['shape_id'][row['direction_id']] = row['shape_id']


def _add_stop_times_to_trips(routes, stop_times_txt):
    """Add stops to services and stop times (and start time) to trips."""
    (services, trips) = _get_services_and_trips(routes)

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
                _add_stop_to_stops(services[trip['service_id']]['stops'][trip['direction_id']], row)


def _get_services_and_trips(routes):
    services = {}
    trips = {}
    for route in routes.itervalues():
        for service_id in route['services']:
            service = route['services'][service_id]
            services[service_id] = service
            for trip_id in service['trips']:
                trips[trip_id] = service['trips'][trip_id]
    return (services, trips)


def _check_stops_times_input_row(row):
    """Check the row in stop_times.txt matches expectations."""
    if not row['arrival_time'].endswith(':00'):
        logging.error('in {} seconds in arrival_time: {}'.format(
            row['trip_id'], row['arrival_time']))


def _get_minutes(time_string):
    """Get number of minutes after midnight from HH:MM:SS time string."""
    (hours, minutes) = time_string.split(':')[0:2]
    return (int(hours) * 60) + int(minutes)


def _add_stop_times_to_trip(trip, row):  # row in stop_times.txt
    arrival_time = _get_minutes(row['arrival_time'])
    departure_time = _get_minutes(row['departure_time'])
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
            logging.error('in trip_id={} two stops for stop_sequence={}: {} {} '.format(
                row['trip_id'], stop_sequence, row['stop_id'],
                stops[stop_sequence]))


def _add_stop_distances_to_services(routes, shapes, stops):
    for route in routes.itervalues():
        for service in route['services'].itervalues():
            for direction_id in service['stops']:
                for _, stop_id in sorted(service['stops'][direction_id].iteritems()):
                    if stop_id not in stops:
                        logging.error('No stop information for stop_id={}'.format(stop_id))
                    else:
                        shape = shapes[service['shape_id'][direction_id]]
                        shape_index = _get_shape_index(shape, stops[stop_id])
                        service['stop_distances'][direction_id].append(shape_index)


def _get_shape_index(shape, lon_lat):
    for i in range(len(shape)):
        if shape[i] == lon_lat:
            return i
    logging.error('no shape index for {}'.format(lon_lat))  # tbd: add some id


def _write_routes_to_file(shapes, routes, routes_json):
    output_routes = []
    stats = {'routes': 0, 'services': 0, 'trips': 0, 'stop_times': 0, 'shapes': 0}

    for route_id in sorted(routes):
        route = routes[route_id]
        _add_shapes_to_route(shapes, route)
        output_services = _get_output_services(route['services'])
        output_route = []  # 0=name, 1=type, 2=shapes, 3=services
        output_route.append(route['name'])
        output_route.append(route['type'])
        output_route.append(route['shapes'])
        output_route.append(output_services['services'])
        output_routes.append(output_route)
        stats['services'] += len(output_services['services']) / 2
        stats['trips'] += output_services['stats']['trips']
        stats['stop_times'] += output_services['stats']['stop_times']
        stats['shapes'] += len(route['shapes'])

    with open(routes_json, 'w') as output_file:
        output_file.write(json.dumps(output_routes, separators=(',', ':')))

    stats['routes'] = len(output_routes)
    logging.debug('output stats: {}'.format(stats))

    # logging.debug('huppa3: {}'.format(output_routes['2132']))


def _add_shapes_to_route(shapes, route):
    for _, service in sorted(route['services'].iteritems()):
        for direction_id, shape_id in service['shape_id'].iteritems():
            if shape_id:  # some services operate only in one direction
                try:
                    service['shape_i'][direction_id] = route['shapes'].index(shapes[shape_id])
                except ValueError:
                    route['shapes'].append(shapes[shape_id])
                    service['shape_i'][direction_id] = len(route['shapes']) - 1


def _get_output_services(services):
    output_services = {'services': [], 'stats': {'trips': 0, 'stop_times': 0}}

    for service_id in sorted(services):
        service = services[service_id]
        for direction_id in ['0', '1']:
            is_departure_times = _is_departure_times_in_service(service)
            output_stop_times = _get_service_stop_times(service, direction_id, is_departure_times)
            # stop times must be set before these
            output_trips = _get_output_trips(service['trips'], direction_id)
            # 0=shape_i, 1=stop_distances, 2=is_departure_times, 3=stop_times, 4=trips
            service_direction = []
            service_direction.append(service['shape_i'][direction_id])
            service_direction.append(_get_delta_list(service['stop_distances'][direction_id]))
            service_direction.append(int(is_departure_times))
            service_direction.append(output_stop_times)
            service_direction.append(output_trips)
            output_services['services'].append(service_direction)
            output_services['stats']['stop_times'] += len(output_stop_times)
            output_services['stats']['trips'] += len(output_trips) / 2

    return output_services


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
            delta_stop_times = _get_delta_list(trip_stop_times)
            delta_stop_times = _integer_list_to_string(delta_stop_times)
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
    return [(integer_list[i] - integer_list[i - 1]) for i in range(1, len(integer_list))]


def _integer_list_to_string(integer_list):
    """For [0, 10, 11, 22, 25] return ''."""
    min_chr = 35  # 35='#'
    max_value = 126 - min_chr  # 126='~'
    if (len(integer_list) > 0) and (max(integer_list) > max_value):
        raise SystemExit('max(integer_list) = {} > {}'.format(max(integer_list), max_value))
    return ''.join([chr(integer + min_chr) for integer in integer_list])


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
        return [start_times[0], _get_delta_list([0] + start_times)[1:], stop_times_indexes]


if __name__ == "__main__":
    _main()
