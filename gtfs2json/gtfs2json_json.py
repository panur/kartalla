#!/usr/bin/env python

"""Create JSON file.

JSON: http://www.json.org/

Author: Panu Ranta, panu.ranta@iki.fi, https://14142.net/kartalla/about.html
"""

import collections
import json
import logging
import os
import time


def create(routes, output_filename, gtfs_modification_time):
    """Create JSON file from parsed GTFS routes."""
    array_keys = _get_array_keys()
    output_route_types = _get_output_route_types()
    output_dates = _get_output_dates(routes)
    output_routes = _get_output_routes(array_keys, output_dates, routes)

    output_data = [None] * len(array_keys['root'])
    output_data[array_keys['root']['array_keys']] = array_keys
    output_data[array_keys['root']['gtfs_epoch']] = gtfs_modification_time
    output_data[array_keys['root']['json_epoch']] = int(time.time())
    output_data[array_keys['root']['route_types']] = output_route_types
    output_data[array_keys['root']['dates']] = output_dates
    output_data[array_keys['root']['routes']] = output_routes

    with open(output_filename, 'w') as output_file:
        output_file.write(json.dumps(output_data, separators=(',', ':')))


def _get_array_keys():
    array_keys = {}
    array_keys['root'] = {'array_keys': 0, 'gtfs_epoch': 1, 'json_epoch': 2, 'route_types': 3,
                          'dates': 4, 'routes': 5}
    array_keys['route'] = {'id': 0, 'name': 1, 'long_name': 2, 'type': 3, 'shapes': 4,
                           'stop_distances': 5, 'trip_dates': 6, 'trip_groups': 7, 'stop_times': 8,
                           'is_departure_times': 9, 'directions': 10}
    array_keys['trip_dates'] = {'start_date_i': 0, 'end_date_i': 1, 'weekdays': 2,
                                'added': 3, 'removed': 4}
    array_keys['trip_group'] = {'shape_i': 0, 'stop_distances_i': 1, 'trip_dates_i': 2}
    array_keys['direction'] = {'trips': 0}
    array_keys['trip'] = {'first_start_time': 0, 'start_times': 1, 'stop_times_indexes': 2,
                          'trip_group_indexes': 3}
    return array_keys


def _get_output_route_types():
    route_types_path = os.path.join(os.path.dirname(__file__), 'route_types.json')
    with open(route_types_path) as route_types_file:
        route_types = json.load(route_types_file)
    return route_types


def _get_output_dates(routes):
    output_dates = collections.OrderedDict()
    for route in routes.itervalues():
        for trip in route['trips'].itervalues():
            dates = [trip['dates']['start_date'], trip['dates']['end_date']]
            for exception_dates in trip['dates']['exception_dates'].itervalues():
                dates = dates + exception_dates
            for date in dates:
                if date not in output_dates:
                    output_dates[date] = 0
                output_dates[date] += 1

    return sorted(output_dates, key=output_dates.get, reverse=True)


def _get_output_routes(array_keys, output_dates, routes):
    output_routes = []
    route_types = set()
    stats = {'route_ids': len(routes), 'shapes': 0}

    for route_id in sorted(routes):
        route = routes[route_id]
        route_types.add(route['type'])
        output_values = _get_route_trips_output_values(
            array_keys, route['trips'], route['is_departure_times'], output_dates)
        output_trip_groups = _get_route_trips_groups(array_keys, route['trips'])
        # cache indexes must be set before this
        output_directions = _get_output_directions(array_keys, route['trips'])
        output_route = [None] * len(array_keys['route'])
        output_route[array_keys['route']['id']] = route['route_id']
        output_route[array_keys['route']['name']] = route['name']
        output_route[array_keys['route']['long_name']] = route['long_name']
        output_route[array_keys['route']['type']] = route['type']
        output_route[array_keys['route']['shapes']] = route['shapes']
        output_route[array_keys['route']['stop_distances']] = output_values['stop_distances']
        output_route[array_keys['route']['trip_dates']] = output_values['trip_dates']
        output_route[array_keys['route']['trip_groups']] = output_trip_groups
        output_route[array_keys['route']['stop_times']] = output_values['stop_times']
        output_route[array_keys['route']['is_departure_times']] = int(route['is_departure_times'])
        output_route[array_keys['route']['directions']] = output_directions
        output_routes.append(output_route)
        stats['shapes'] += len(route['shapes'])

    logging.debug('route types: {}'.format(route_types))
    logging.debug('output stats: {}'.format(stats))

    return output_routes


def _get_route_trips_output_values(array_keys, trips, is_departure_times, output_dates):
    output_values = {'stop_distances': [], 'stop_times': [], 'trip_dates': []}
    get_new_value = {
        'stop_distances': _get_new_value_stop_distances,
        'stop_times': _get_new_value_stop_times,
        'trip_dates': _get_new_value_trip_dates,
    }
    for trip in trips.itervalues():
        trip['times']['is_departure_times'] = is_departure_times
        for value_name in output_values:
            new_value = get_new_value[value_name](array_keys, trip, output_dates)
            trip['cache_indexes'][value_name + '_i'] = _get_cache_index(output_values[value_name],
                                                                        new_value)
    return output_values


def _get_new_value_stop_distances(_, trip, dummy):
    delta_stop_distances = _get_delta_list(trip['stop_distances'])
    return _integer_list_to_string(delta_stop_distances)


def _get_cache_index(cache_values, new_value):
    try:
        return cache_values.index(new_value)
    except ValueError:
        cache_values.append(new_value)
        return len(cache_values) - 1


def _get_route_trips_groups(array_keys, trips):
    route_trip_groups = []
    for trip in trips.itervalues():
        cis = trip['cache_indexes']
        output_trip_group = [None] * len(array_keys['trip_group'])
        output_trip_group[array_keys['trip_group']['shape_i']] = cis['shape_i']
        output_trip_group[array_keys['trip_group']['stop_distances_i']] = cis['stop_distances_i']
        output_trip_group[array_keys['trip_group']['trip_dates_i']] = cis['trip_dates_i']
        cis['trip_group_i'] = _get_cache_index(route_trip_groups, output_trip_group)
    return route_trip_groups


def _get_output_directions(array_keys, trips):
    output_directions = []
    if trips.values()[0]['direction_id'] == '-':
        directions = ['-']
    else:
        directions = ['0', '1']
    for direction in directions:
        output_directions.append(_get_output_direction(array_keys, trips, direction))
    return output_directions


def _get_output_direction(array_keys, trips, direction_id):
    output_trips = _get_output_trips(array_keys, trips, direction_id)
    output_direction = [None] * len(array_keys['direction'])
    output_direction[array_keys['direction']['trips']] = output_trips
    return output_direction


def _get_new_value_trip_dates(array_keys, trip, output_dates):
    start_date_i = output_dates.index(trip['dates']['start_date'])
    end_date_i = output_dates.index(trip['dates']['end_date'])
    exception_dates = _get_output_exception_dates(trip['dates']['exception_dates'], output_dates)
    output_trip_dates = [None] * len(array_keys['trip_dates'])
    output_trip_dates[array_keys['trip_dates']['start_date_i']] = start_date_i
    output_trip_dates[array_keys['trip_dates']['end_date_i']] = end_date_i
    output_trip_dates[array_keys['trip_dates']['weekdays']] = trip['dates']['weekdays']
    output_trip_dates[array_keys['trip_dates']['added']] = exception_dates['added']
    output_trip_dates[array_keys['trip_dates']['removed']] = exception_dates['removed']
    return output_trip_dates


def _get_output_exception_dates(exception_dates, output_dates):
    output_exception_dates = {'added': [], 'removed': []}
    for exception_type in sorted(exception_dates):
        for exception_date in exception_dates[exception_type]:
            dates = output_exception_dates[exception_type]
            dates.append(output_dates.index(exception_date))
    return output_exception_dates


def _get_new_value_stop_times(_, trip, dummy):
    trip_stop_times = _get_trip_stop_times(trip['times']['stop_times'],
                                           trip['times']['is_departure_times'])
    return _integer_list_to_string(_get_delta_list(trip_stop_times))


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


def _get_output_trips(array_keys, input_trips, direction_id):
    trips = {}  # by start time

    for _, trip in sorted(input_trips.iteritems()):
        if trip['direction_id'] == direction_id:
            start_time = trip['times']['start_time']
            if start_time not in trips:
                trips[start_time] = []
            trips[start_time].append({
                'stop_times_i': trip['cache_indexes']['stop_times_i'],
                'trip_group_i': trip['cache_indexes']['trip_group_i']
            })

    if len(trips) == 0:
        return []  # some routes operate only in one direction

    sorted_trips = collections.OrderedDict(sorted(trips.items()))
    start_times = []
    stop_times_indexes = []
    trip_group_indexes = []

    for start_time in sorted_trips:
        for trip in sorted_trips[start_time]:
            start_times.append(start_time)
            stop_times_indexes.append(trip['stop_times_i'])
            trip_group_indexes.append(trip['trip_group_i'])

    output_trips = [None] * len(array_keys['trip'])
    output_trips[array_keys['trip']['first_start_time']] = start_times[0]
    output_trips[array_keys['trip']['start_times']] = _integer_list_to_string(
        _get_delta_list([0] + start_times)[1:])
    output_trips[array_keys['trip']['stop_times_indexes']] = _integer_list_to_string(
        stop_times_indexes)
    output_trips[array_keys['trip']['trip_group_indexes']] = _integer_list_to_string(
        trip_group_indexes)
    return output_trips
