/* Author: Panu Ranta, panu.ranta@iki.fi */

'use strict';  // tbd

function Gtfs() {
    var that = this; /* http://javascript.crockford.com/private.html */
    var state = {};

    this.init = function (url, readyEvent) {
        var utils = new Utils();
        utils.downloadUrl(url, function (data, responseCode) {
            state.root = JSON.parse(data)
            console.log('root is read');
            document.dispatchEvent(readyEvent);
            console.log('root is read2');
        }, function (error) {
            console.error(error)
        });
    }

    this.getDates = function () {
        return state.root[0];
    }

    this.getRoutes = function () {
        var routes = [];
        for (var i = 0; i < state.root[1].length; i++) {
            var route = new GtfsRoute(that, i);
            routes.push(route);
        }
        return routes;
    }

    this.getRootRoute = function (routeIndex) {
        return state.root[1][routeIndex];
    }

    // For '#$%1~!$2!~!!$3' return [0, 1, 2, 14, 91, 92, 15, 182, 183, 16].
    this.string_to_integer_list = function (string) {
        var integer_list = [];
        var integer_value = 0;
        var mult_chr = 33; // 33='!'
        var min_chr = 35;  // 35='#', not 34='"' because it takes three characters in JSON
        var max_chr = 126; // 126='~'
        var max_value = max_chr - min_chr;
        for (var i = 0; i < string.length; i++) {
            var charCode = string.charCodeAt(i);
            if (charCode == mult_chr) {
                integer_value += max_value;
            } else {
                integer_value += charCode - min_chr;
                integer_list.push(integer_value);
                integer_value = 0;
            }
        }
        console.log('s: ' + string + ', l: ' + integer_list);
        return integer_list;
    }

    // For [10, 1, 11, 3] return [0, 10, 11, 22, 25]
    this.unpack_delta_list = function (integer_list) {
        var unpacked_list = [0];
        for (var i = 0; i < integer_list.length; i++) {
            unpacked_list.push(unpacked_list[i] + integer_list[i]);
        }
        return unpacked_list;
    }
}

function GtfsRoute(gtfsRoot, routeIndex) {
    var that = this;

    this.getActiveServices = function () {
        var services = [];
        var rootRoute = gtfsRoot.getRootRoute(routeIndex);
        for (var i = 0; i < getServices(rootRoute).length; i++) {
            var service = new GtfsService(gtfsRoot, that, i);
            if (service.isActive()) {
                services.push(service);
            }
        }
        return services;
    }

    this.getRootService = function (serviceIndex) {
        var rootRoute = gtfsRoot.getRootRoute(routeIndex);
        return getServices(rootRoute)[serviceIndex];
    }

    // 0=name, 1=type, 2=shapes, 3=directions, 4=services
    this.getName = function () {
        var rootRoute = gtfsRoot.getRootRoute(routeIndex);
        return rootRoute[0];
    }

    this.getDirections = function () {
        var rootRoute = gtfsRoot.getRootRoute(routeIndex);
        return rootRoute[3];
    }

    function getServices(rootRoute) {
        return rootRoute[4];
    }
}

function GtfsService(gtfsRoot, gtfsRoute, serviceIndex) {
    var that = this;

    this.isActive = function () {
        var rootService = gtfsRoute.getRootService(serviceIndex);
        if (getWeekDay(rootService) == 1) {
            return true;
        } else {
            return false;
        }
    }

    this.getRootDirection = function () {
        var rootService = gtfsRoute.getRootService(serviceIndex);
        var directionsI = getDirectionsI(rootService);
        var directions = gtfsRoute.getDirections();
        var direction = directions[directionsI];
        console.debug('for serviceIndex: ' + serviceIndex + ', directionsI: ' + directionsI);
        console.debug('direction.length: ' + direction.length);
        return direction[0]; // tbd: direction_id=0 for now
    }

    this.getDirection = function () {
        return new GtfsDirection(gtfsRoot, gtfsRoute, that);
    }

    // 0=start_date_i, 1=end_date_i, 2=weekday, 3=exception_dates, 4=directions_i
    function getWeekDay(rootService) {
        return rootService[2];
    }

    function getDirectionsI(rootService) {
        return rootService[4];
    }
}

function GtfsDirection(gtfsRoot, gtfsRoute, gtfsService) {
    // 0=shape_i, 1=stop_distances, 2=is_departure_times, 3=stop_times, 4=trips
    this.getStopDistances = function () {
        var rootDirection = gtfsService.getRootDirection()[0];  // tbd: extra level
        console.debug('rootDirection.length: ' + rootDirection.length);
        console.debug('rdump: ' + rootDirection);
        return gtfsRoot.unpack_delta_list(gtfsRoot.string_to_integer_list(rootDirection[1]));
    }
}

function GtfsTrip() {
    this.isActive = function () {
    }
}
