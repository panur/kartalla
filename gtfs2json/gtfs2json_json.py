#!/usr/bin/env python

"""Create JSON file.

JSON: http://www.json.org/

Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html
"""

import collections
import json
import logging
import time


def create(routes, output_filename, gtfs_modification_time):
    """Create JSON file from parsed GTFS routes."""
    array_keys = _get_array_keys()
    output_dates = _get_output_dates(routes)
    output_routes = _get_output_routes(array_keys, output_dates, routes)

    output_data = [None] * len(array_keys['root'])
    output_data[array_keys['root']['array_keys']] = array_keys
    output_data[array_keys['root']['gtfs_epoch']] = gtfs_modification_time
    output_data[array_keys['root']['json_epoch']] = int(time.time())
    output_data[array_keys['root']['is_direction']] = int(routes.values()[0]['is_direction'])
    output_data[array_keys['root']['dates']] = output_dates
    output_data[array_keys['root']['routes']] = output_routes

    with open(output_filename, 'w') as output_file:
        output_file.write(json.dumps(output_data, separators=(',', ':')))


def _get_array_keys():
    array_keys = {}
    array_keys['root'] = {'array_keys': 0, 'gtfs_epoch': 1, 'json_epoch': 2, 'is_direction': 3,
                          'dates': 4, 'routes': 5}
    array_keys['route'] = {'id': 0, 'name': 1, 'long_name': 2, 'type': 3, 'shapes': 4,
                           'directions': 5, 'services': 6}
    array_keys['direction'] = {'shape_i': 0, 'stop_distances': 1, 'is_departure_times': 2,
                               'stop_times': 3, 'trips': 4}
    array_keys['service'] = {'start_date_i': 0, 'end_date_i': 1, 'weekdays': 2,
                             'exception_dates': 3, 'directions_i': 4}
    array_keys['trip'] = {'first_start_time': 0, 'start_times': 1, 'stop_times_indexes': 2}
    array_keys['exception_dates'] = {'added': 0, 'removed': 1}
    return array_keys


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


def _get_output_routes(array_keys, output_dates, routes):
    output_routes = []
    stats = {'route_ids': len(routes), 'services': 0, 'trip_ids': 0, 'shapes': 0,
             'directions': 0, 'stop_times': 0}

    for route_id in sorted(routes):
        route = routes[route_id]
        output_directions = _get_output_directions(array_keys, route['services'])
        output_services = _get_output_services(array_keys, route['services'], output_dates)
        output_route = [None] * len(array_keys['route'])
        output_route[array_keys['route']['id']] = route['route_id']
        output_route[array_keys['route']['name']] = route['name']
        output_route[array_keys['route']['long_name']] = route['long_name']
        output_route[array_keys['route']['type']] = route['type']
        output_route[array_keys['route']['shapes']] = route['shapes']
        output_route[array_keys['route']['directions']] = output_directions['directions']
        output_route[array_keys['route']['services']] = output_services
        output_routes.append(output_route)
        stats['services'] += len(route['services'])
        stats['trip_ids'] += output_directions['stats']['trip_ids']
        stats['stop_times'] += output_directions['stats']['stop_times']
        stats['shapes'] += len(route['shapes'])
        stats['directions'] += len(output_directions['directions'])

    logging.debug('output stats: {}'.format(stats))

    return output_routes


def _get_output_directions(array_keys, services):
    output = {'directions': [], 'stats': {'trip_ids': 0, 'stop_times': 0}}

    for _, service in sorted(services.iteritems()):
        output['stats']['trip_ids'] += len(service['trips'])
        output_directions = [None, None]
        for direction_id, direction in sorted(service['directions'].iteritems()):
            if direction['shape_id']:  # some services operate only in one direction
                output_direction = _get_output_direction(array_keys, service, direction_id,
                                                         direction, output['stats'])
            else:
                output_direction = []
            output_directions[int(direction_id)] = output_direction
        try:
            service['directions_i'] = output['directions'].index(output_directions)
        except ValueError:
            output['directions'].append(output_directions)
            service['directions_i'] = len(output['directions']) - 1

    return output


def _get_output_direction(array_keys, service, direction_id, direction, stats):
    delta_stop_distances = _get_delta_list(direction['stop_distances'])
    output_stop_distances = _integer_list_to_string(delta_stop_distances)
    is_departure_times = _is_departure_times_in_service(service)
    output_stop_times = _get_service_stop_times(service, direction_id, is_departure_times)
    stats['stop_times'] += len(output_stop_times)
    # stop times must be set before this
    output_trips = _get_output_trips(array_keys, service['trips'], direction_id)
    output_direction = [None] * len(array_keys['direction'])
    output_direction[array_keys['direction']['shape_i']] = direction['shape_i']
    output_direction[array_keys['direction']['stop_distances']] = output_stop_distances
    output_direction[array_keys['direction']['is_departure_times']] = int(is_departure_times)
    output_direction[array_keys['direction']['stop_times']] = output_stop_times
    output_direction[array_keys['direction']['trips']] = output_trips
    return output_direction


def _get_output_services(array_keys, services, output_dates):
    output_services = []

    for _, service in sorted(services.iteritems()):
        start_date_i = output_dates.index(service['start_date'])
        end_date_i = output_dates.index(service['end_date'])
        exception_dates = _get_output_exception_dates(array_keys, service['exception_dates'],
                                                      output_dates)
        output_service = [None] * len(array_keys['service'])
        output_service[array_keys['service']['start_date_i']] = start_date_i
        output_service[array_keys['service']['end_date_i']] = end_date_i
        output_service[array_keys['service']['weekdays']] = service['weekdays']
        output_service[array_keys['service']['exception_dates']] = exception_dates
        output_service[array_keys['service']['directions_i']] = service['directions_i']
        output_services.append(output_service)

    return output_services


def _get_output_exception_dates(array_keys, exception_dates, output_dates):
    output_exception_dates = [None] * len(array_keys['exception_dates'])
    output_exception_dates[array_keys['exception_dates']['added']] = []
    output_exception_dates[array_keys['exception_dates']['removed']] = []

    for exception_type in sorted(exception_dates):
        for exception_date in exception_dates[exception_type]:
            dates = output_exception_dates[array_keys['exception_dates'][exception_type]]
            dates.append(output_dates.index(exception_date))
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


def _get_output_trips(array_keys, trips, direction_id):
    times = {}

    for _, trip in sorted(trips.iteritems()):
        if trip['direction_id'] == direction_id:
            times[trip['start_time']] = trip['stop_times_i']

    sorted_times = collections.OrderedDict(sorted(times.items()))
    start_times = sorted_times.keys()
    stop_times_indexes = sorted_times.values()

    delta_start_times = _integer_list_to_string(_get_delta_list([0] + start_times)[1:])
    stop_times_indexes_string = _integer_list_to_string(stop_times_indexes)

    output_trips = [None] * len(array_keys['trip'])
    output_trips[array_keys['trip']['first_start_time']] = start_times[0]
    output_trips[array_keys['trip']['start_times']] = delta_start_times
    output_trips[array_keys['trip']['stop_times_indexes']] = stop_times_indexes_string
    return output_trips
