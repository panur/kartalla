#!/usr/bin/env python

"""Convert HSL/Liikennevirasto GTFS files into JSON.

HSL GTFS: http://dev.hsl.fi/gtfs/
Liikennevirasto (Finnish Transport Agency) GTFS: http://developer.matka.fi/pages/en/home.php

Author: Panu Ranta, panu.ranta@iki.fi, https://14142.net/kartalla/about.html
"""

import argparse
import csv
import logging
import os
import resource
import sys
import time

import gtfs2json_gtfs
import gtfs2json_json


def _main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input_dir_or_zip', help='GTFS input directory or ZIP file')
    parser.add_argument('output_file', help='JSON output file')
    parser.add_argument('--log-file', default='gtfs2json.log', help='Log file')
    parser.add_argument('--additional-files', help='Additional JSON output files')
    args = parser.parse_args()

    _init_logging(args.log_file)

    start_time = time.time()
    logging.debug('started {}'.format(sys.argv))

    routes = gtfs2json_gtfs.get_routes(args.input_dir_or_zip)
    gtfs_modification_time = gtfs2json_gtfs.get_modification_time(args.input_dir_or_zip)
    print 'creating output file...'
    gtfs2json_json.create(routes, args.output_file, gtfs_modification_time)

    if args.additional_files:
        additional_output_files = _get_additional_output_files(args.additional_files)
        print 'creating additional output files...'
        output_dir = os.path.dirname(args.output_file)
        for additional_output_file in additional_output_files:
            output_filename = os.path.join(output_dir, additional_output_file['filename'])
            filtered_routes = _get_filtered_routes(routes, additional_output_file['agencies'])
            logging.debug('creating {}'.format(output_filename))
            gtfs2json_json.create(filtered_routes, output_filename, gtfs_modification_time)

    logging.debug('took {} seconds, max mem: {} megabytes'.format(
        int(time.time() - start_time), resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024))


def _init_logging(filename):
    log_format = '%(asctime)s %(levelname)s %(filename)s:%(lineno)d %(funcName)s: %(message)s'
    logging.basicConfig(filename=filename, format=log_format, level=logging.DEBUG)


def _get_additional_output_files(filename):
    areas = {}
    with open(filename) as input_file:
        csv_reader = csv.DictReader(input_file)
        for row in csv_reader:
            area = row['area'].strip()
            if area != '':
                if area not in areas:
                    areas[area] = []
                areas[area].append(row['agency_id'])

    additional_output_files = []
    for area in sorted(areas):
        additional_output_files.append({'filename': '{}.json'.format(area),
                                        'agencies': areas[area]})
    return additional_output_files


def _get_filtered_routes(routes, agencies):
    filtered_routes = {}
    for route in routes.itervalues():
        if route['agency_id'] in agencies:
            filtered_routes[route['route_id']] = route
    return filtered_routes


if __name__ == "__main__":
    _main()
