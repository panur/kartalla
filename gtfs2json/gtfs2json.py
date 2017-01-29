#!/usr/bin/env python

"""Convert HSL/Liikennevirasto GTFS files into JSON.

HSL GTFS: http://developer.reittiopas.fi/pages/en/other-apis.php
Liikennevirasto (Finnish Transport Agency) GTFS: http://developer.matka.fi/pages/en/home.php

Author: Panu Ranta, panu.ranta@iki.fi, https://14142.net/kartalla/about.html
"""

import argparse
import json
import logging
import os
import resource
import sys
import time

import gtfs2json_gtfs
import gtfs2json_json


def _main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input_dir', help='GTFS input directory')
    parser.add_argument('output_file', help='JSON output file')
    parser.add_argument('--additional-files', help='Additional JSON output files')
    args = parser.parse_args()

    _init_logging()

    start_time = time.time()
    logging.debug('started {}'.format(sys.argv))

    routes = gtfs2json_gtfs.get_routes(args.input_dir)
    gtfs_modification_time = gtfs2json_gtfs.get_modification_time(args.input_dir)
    print 'creating output file...'
    gtfs2json_json.create(routes, args.output_file, gtfs_modification_time)

    if args.additional_files:
        additional_output_files = _get_additional_output_files(args.additional_files)
        print 'creating additional output files...'
        output_dir = os.path.dirname(args.output_file)
        for additional_output_file in additional_output_files:
            output_filename = os.path.join(output_dir, additional_output_file['filename'])
            filtered_routes = _get_filtered_routes(routes, additional_output_file['agencies'])
            gtfs2json_json.create(filtered_routes, output_filename, gtfs_modification_time)

    logging.debug('took {} seconds, max mem: {} megabytes'.format(
        int(time.time() - start_time), resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024))


def _init_logging():
    log_format = '%(asctime)s %(levelname)s %(filename)s:%(lineno)d %(funcName)s: %(message)s'
    logging.basicConfig(filename='gtfs2json.log', format=log_format, level=logging.DEBUG)


def _get_additional_output_files(filename):
    with open(filename) as json_file:
        return json.load(json_file)


def _get_filtered_routes(routes, agencies):
    filtered_routes = {}
    for route in routes.itervalues():
        if route['agency_id'] in agencies:
            filtered_routes[route['route_id']] = route
    return filtered_routes


if __name__ == "__main__":
    _main()
