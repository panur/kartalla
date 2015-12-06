#!/usr/bin/env python

"""Convert HSL GTFS files into JSON."""

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
    print 'encoding shapes...'
    _encode_shapes(shapes)
    print 'writing routes to file...'
    _write_routes_to_file(shapes, routes, os.path.join(args.output_dir, 'routes.json'))

    print 'max mem: {} megabytes'.format(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)


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


def _encode_shapes(shapes):  # tbd: encode only shapes in use
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
                logging.error('In route_id={} route_type {} not in {}'.format(
                    row['route_id'], row['route_type'], route_types))
            # create new route
            routes[row['route_id']] = {'route_id': row['route_id'],
                                       'name': row['route_short_name'],
                                       'type': route_types.get(row['route_type'],
                                                               row['route_type']),
                                       'services': {},  # by service_id
                                       'shapes': []}

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
            'trips': {},  # by trip_id
            'directions': {'0': _create_direction(), '1': _create_direction()}}
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
            'stop_times_i': None}

        _add_shape_id_to_direction(service['directions'][row['direction_id']], row)


def _create_direction():
    return {
        'shape_id': None,
        'shape_i': None,
        'stops': {},  # by stop_sequence
        'stop_distances': []  # shape indexes
    }


def _add_shape_id_to_direction(direction, row):  # row in trips.txt
    if direction['shape_id'] and (row['shape_id'] != direction['shape_id']):
        logging.error('In service_id={} duplicate shape_id: {}'.format(
            row['service_id'], row['shape_id']))

    direction['shape_id'] = row['shape_id']


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


def _add_stop_distances_to_services(routes, shapes, stops):
    for route in routes.itervalues():
        for service in route['services'].itervalues():
            for direction in service['directions'].itervalues():
                for _, stop_id in sorted(direction['stops'].iteritems()):
                    if stop_id not in stops:
                        logging.error('No stop information for stop_id={}'.format(stop_id))
                    else:
                        shape = shapes[direction['shape_id']]
                        if len(direction['stop_distances']) == 0:
                            previous_index = 0
                        else:
                            previous_index = direction['stop_distances'][-1]
                        shape_index = _get_shape_index(shape, stops[stop_id], previous_index)
                        direction['stop_distances'].append(shape_index)


def _get_shape_index(shape, lon_lat, previous_index):
    for i in range(previous_index, len(shape)):
        if shape[i] == lon_lat:
            return i
    logging.error('No shape index for {}'.format(lon_lat))  # tbd: add some id


def _write_routes_to_file(shapes, routes, routes_json):
    output_routes = []
    stats = {'route_ids': len(routes), 'service_ids': 0, 'trip_ids': 0, 'shapes': 0,
             'stop_times': 0}

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
        stats['service_ids'] += len(route['services'])
        stats['trip_ids'] += output_services['stats']['trip_ids']
        stats['stop_times'] += output_services['stats']['stop_times']
        stats['shapes'] += len(route['shapes'])

    with open(routes_json, 'w') as output_file:
        output_file.write(json.dumps(output_routes, separators=(',', ':')))

    logging.debug('output stats: {}'.format(stats))


def _add_shapes_to_route(shapes, route):
    for _, service in sorted(route['services'].iteritems()):
        for direction in service['directions'].itervalues():
            if direction['shape_id']:  # some services operate only in one direction
                try:
                    direction['shape_i'] = route['shapes'].index(shapes[direction['shape_id']])
                except ValueError:
                    route['shapes'].append(shapes[direction['shape_id']])
                    direction['shape_i'] = len(route['shapes']) - 1


def _get_output_services(services):
    output_services = {'services': [], 'stats': {'trip_ids': 0, 'stop_times': 0}}

    for _, service in sorted(services.iteritems()):
        output_directions = [[], []]
        for direction_id, direction in sorted(service['directions'].iteritems()):
            delta_stop_distances = _get_delta_list(direction['stop_distances'])
            output_stop_distances = _integer_list_to_string(delta_stop_distances)
            is_departure_times = _is_departure_times_in_service(service)
            output_stop_times = _get_service_stop_times(service, direction_id, is_departure_times)
            # stop times must be set before these
            output_trips = _get_output_trips(service['trips'], direction_id)
            # 0=shape_i, 1=stop_distances, 2=is_departure_times, 3=stop_times, 4=trips
            output_direction = []
            output_direction.append(direction['shape_i'])
            output_direction.append(output_stop_distances)
            output_direction.append(int(is_departure_times))
            output_direction.append(output_stop_times)
            output_direction.append(output_trips)
            output_directions[int(direction_id)].append(output_direction)
            output_services['stats']['stop_times'] += len(output_stop_times)
        output_services['services'].append(output_directions)
        output_services['stats']['trip_ids'] += len(service['trips'])

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
