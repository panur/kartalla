#!/usr/bin/env python

"""Convert HSL GTFS files into JSON.

HSL GTFS: http://developer.reittiopas.fi/pages/en/other-apis.php

Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html
"""

import argparse
import logging
import resource
import sys
import time

import gtfs2json_gtfs
import gtfs2json_json


def _main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input_dir', help='GTFS input directory')
    parser.add_argument('output_file', help='JSON output file')
    args = parser.parse_args()

    _init_logging()

    start_time = time.time()
    logging.debug('started {}'.format(sys.argv))

    routes = gtfs2json_gtfs.get_routes(args.input_dir)
    gtfs_modification_time = gtfs2json_gtfs.get_modification_time(args.input_dir)
    print 'creating output file...'
    gtfs2json_json.create(routes, args.output_file, gtfs_modification_time)

    logging.debug('took {} seconds, max mem: {} megabytes'.format(
        int(time.time() - start_time), resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024))


def _init_logging():
    log_format = '%(asctime)s %(levelname)s %(filename)s:%(lineno)d %(funcName)s: %(message)s'
    logging.basicConfig(filename='gtfs2json.log', format=log_format, level=logging.DEBUG)


if __name__ == "__main__":
    _main()
