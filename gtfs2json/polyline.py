"""Encode list of points ((lat,lng) tuples) into string.

Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html
"""

import math
import sys


def encode(points, fixed_indexes=None, very_small=0.00001):
    """Encode points into Google's encoded polyline format
    (https://developers.google.com/maps/documentation/utilities/polylinealgorithm). Redundant
    points are dropped except points in fixed_indexes."""
    encoded_polyline = {}
    if not fixed_indexes:
        fixed_indexes = [0, len(points) - 1]
    if len(points) == len(fixed_indexes):
        (points_to_be_encoded, indexes, kept_indexes) = (points, range(len(points)),
                                                         range(len(points)))
    else:
        (points_to_be_encoded, indexes, kept_indexes) = _get_points_to_be_encoded(
            points, fixed_indexes, very_small)
    encoded_polyline['num_dropped_points'] = len(points) - len(points_to_be_encoded)
    encoded_polyline['fixed_indexes'] = indexes
    encoded_polyline['kept_indexes'] = kept_indexes
    encoded_polyline['points'] = _create_encodings(points_to_be_encoded)
    return encoded_polyline


def _get_points_to_be_encoded(points, fixed_indexes, very_small):
    """Get list of points to be encoded and fixed indexes of encoded points."""
    points_to_be_encoded = []
    encoded_fixed_indexes = [0]
    kept_indexes = []

    for i in range(len(fixed_indexes) - 1):
        sub_points = points[fixed_indexes[i]:(fixed_indexes[i + 1] + 1)]
        dropped_indexes = _dp_encode(sub_points, very_small)
        for j in range(len(dropped_indexes)):
            if (j == 0) or (j == (len(dropped_indexes) - 1)) or (dropped_indexes[j] is False):
                points_to_be_encoded.append(sub_points[j])
                kept_indexes.append(fixed_indexes[i] + j)
        encoded_fixed_indexes.append(len(points_to_be_encoded) - 1)

    return (points_to_be_encoded, encoded_fixed_indexes, kept_indexes)


def _dp_encode(points, very_small):
    """Determine points to be dropped using Douglas-Peucker algorithm. Based on Mark McClure's
    PolylineEncoder.js."""
    stack = []
    dropped_indexes = [True] * len(points)

    if len(points) > 2:
        stack.append([0, len(points) - 1])
        while len(stack) > 0:
            current = stack.pop()
            max_dist = 0
            seg_len = (math.pow(points[current[1]][0] - points[current[0]][0], 2) +
                       math.pow(points[current[1]][1] - points[current[0]][1], 2))
            for i in range(current[0] + 1, current[1]):
                distance = _distance(points[i], points[current[0]], points[current[1]], seg_len)
                if distance > max_dist:
                    max_dist = distance
                    max_loc = i

            if max_dist > very_small:
                dropped_indexes[max_loc] = False
                stack.append([current[0], max_loc])
                stack.append([max_loc, current[1]])

    return dropped_indexes


def _distance(point0, point1, point2, seg_len):
    """Compute distance between point0 and segment [point1, point2]. Based on Mark McClure's
    PolylineEncoder.js."""
    if (point1[0] == point2[0]) and (point1[1] == point2[1]):
        out = _dist(point0, point2)
    else:
        uuu = ((point0[0] - point1[0]) * (point2[0] - point1[0]) +
               (point0[1] - point1[1]) * (point2[1] - point1[1])) / seg_len

        if uuu <= 0:
            out = _dist(point0, point1)
        elif uuu >= 1:
            out = _dist(point0, point2)
        else:
            out = math.sqrt(math.pow((point0[0] - point1[0]) - (uuu * (point2[0] - point1[0])), 2) +
                            math.pow((point0[1] - point1[1]) - (uuu * (point2[1] - point1[1])), 2))
    return out


def _dist(point1, point2):
    """Compute distance between point1 and point2."""
    return math.sqrt(math.pow(point2[0] - point1[0], 2) + math.pow(point2[1] - point1[1], 2))


def _create_encodings(points):
    """Encode points into Google's encoded polyline format. Based on Mark McClure's
    PolylineEncoder.js."""
    previous_lat = 0
    previous_lng = 0
    encoded_points = ''

    for i in range(len(points)):
        lat = int(math.floor(points[i][0] * 1e5))
        lng = int(math.floor(points[i][1] * 1e5))
        delta_lat = lat - previous_lat
        delta_lng = lng - previous_lng
        previous_lat = lat
        previous_lng = lng
        encoded_points += _encode_signed_number(delta_lat) + _encode_signed_number(delta_lng)

    return encoded_points


def _encode_number(num):
    encode_string = ''

    while num >= 0x20:
        next_value = (0x20 | (num & 0x1F)) + 63
        encode_string += chr(next_value)
        num >>= 5

    final_value = num + 63
    encode_string += chr(final_value)
    return encode_string


def _encode_signed_number(num):
    sgn_num = num << 1
    if num < 0:
        sgn_num = ~sgn_num
    return _encode_number(sgn_num)


def get_point_index(points, point, previous_index):
    """Find index of the point in points that is closest to point after previous_index."""
    min_dist = {'i': None, 'v': sys.maxint}
    for i in range(previous_index, len(points)):
        dist = _dist(points[i], point)
        if dist < min_dist['v']:
            min_dist['i'] = i
            min_dist['v'] = dist
    return min_dist['i']
