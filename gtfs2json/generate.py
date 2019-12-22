#!/usr/bin/env python3

"""Download GTFS file and generate JSON file.

Author: Panu Ranta, panu.ranta@iki.fi, https://14142.net/kartalla/about.html
"""

import argparse
import datetime
import hashlib
import json
import logging
import os
import resource
import shutil
import sys
import tempfile
import time
import zipfile


def _main():
    parser = argparse.ArgumentParser()
    parser.add_argument('config', help='JSON configuration file')
    parser.add_argument('--only-download', action='store_true', help='Only download GTFS file')
    args = parser.parse_args()

    _init_logging()

    start_time = time.time()
    logging.debug('started {}'.format(sys.argv))

    config = _load_config(args.config)

    gtfs_name = config['name']
    downloaded_gtfs_zip = _download_gtfs(config['url'])
    modify_date = _get_modify_date(downloaded_gtfs_zip)
    gtfs_zip = _rename_gtfs_zip(config['gtfs_dir'], downloaded_gtfs_zip, gtfs_name, modify_date)
    if gtfs_zip and (not args.only_download):
        _generate_json(gtfs_name, modify_date, gtfs_zip, config['json_dir'], config['log_dir'])

    logging.debug('took {} seconds, max mem: {} megabytes'.format(
        int(time.time() - start_time), resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024))


def _init_logging():
    log_format = '%(asctime)s %(levelname)s %(filename)s:%(lineno)d %(funcName)s: %(message)s'
    logging.basicConfig(filename='generate.log', format=log_format, level=logging.DEBUG)


def _progress(text):
    print(text)
    logging.debug(text)


def _progress_warning(text):
    print('\033[31m{}\033[0m'.format(text))
    logging.warning(text)


def _load_config(config_path):
    with open(config_path) as config_file:
        return json.load(config_file)


def _download_gtfs(url):
    output_file, output_filename = tempfile.mkstemp(dir='.')
    os.close(output_file)
    command = 'curl "{}" --location > {}'.format(url, output_filename)
    _progress('downloading gtfs file into: {}'.format(os.path.relpath(output_filename)))
    _execute_command(command)
    return output_filename


def _execute_command(command):
    os.system(command)


def _get_modify_date(zip_filename):
    modify_times = _get_modify_times(zip_filename)
    if len(modify_times) > 1:
        _progress_warning('multiple modify times: {}'.format(modify_times))
    return list(modify_times)[0]


def _get_modify_times(zip_filename):
    modify_times = set()
    with zipfile.ZipFile(zip_filename) as zip_file:
        for info in zip_file.infolist():
            modify_times.add(datetime.datetime(*info.date_time).strftime('%Y%m%d'))
    return modify_times


def _rename_gtfs_zip(gtfs_dir, old_filename, gtfs_name, modify_date):
    _create_dir(gtfs_dir)
    new_filename = os.path.join(gtfs_dir, '{}_{}.zip'.format(gtfs_name, modify_date))
    if os.path.isfile(new_filename):
        if _compare_files(old_filename, new_filename):
            _progress('downloaded gtfs file is identical to: {}'.format(new_filename))
            os.remove(old_filename)
            return None
    _rename_existing_file(new_filename)
    os.rename(old_filename, new_filename)
    _progress('renamed: {} -> {}'.format(old_filename, new_filename))
    return new_filename


def _create_dir(new_dir):
    if not os.path.isdir(new_dir):
        os.makedirs(new_dir)


def _compare_files(filename_a, filename_b):
    return _get_hash(filename_a) == _get_hash(filename_b)


def _get_hash(filename):
    file_hash = hashlib.sha256()
    with open(filename, 'rb') as input_file:
        file_hash.update(input_file.read())
    return file_hash.digest()


def _generate_json(gtfs_name, modify_date, gtfs_zip, json_dir, log_dir):
    _create_dir(json_dir)
    date_output_file = os.path.join(json_dir, '{}_{}.json'.format(gtfs_name, modify_date))
    _rename_existing_file(date_output_file)
    _create_dir(log_dir)
    log_path = os.path.join(log_dir, 'gtfs2json_{}_{}_{}.log'.format(gtfs_name, modify_date,
                                                                     _get_now_timestamp()))
    _progress('generating json for {}'.format(gtfs_zip))
    command = '{}/gtfs2json.py --log-file {} {} {}'.format(os.path.dirname(__file__), log_path,
                                                           gtfs_zip, date_output_file)
    _execute_command(command)

    _create_base_output_file(date_output_file, os.path.join(json_dir, '{}.json'.format(gtfs_name)))


def _create_base_output_file(date_output_file, base_output_file):
    if os.path.isfile(base_output_file):
        _progress('deleting {}'.format(base_output_file))
        os.remove(base_output_file)
    _progress('copying {} to {}'.format(date_output_file, base_output_file))
    shutil.copyfile(date_output_file, base_output_file)


def _rename_existing_file(filename):
    if os.path.isfile(filename):
        suffix = filename.split('.')[-1]
        new_filename = filename.replace('.{}'.format(suffix),
                                        '_{}.{}'.format(_get_now_timestamp(), suffix))
        os.rename(filename, new_filename)
        _progress_warning('renamed existing {} file {} -> {}'.format(suffix, filename,
                                                                     new_filename))


def _get_now_timestamp():
    return datetime.datetime.now().strftime('%Y%m%d_%H%M%S')


if __name__ == "__main__":
    _main()
