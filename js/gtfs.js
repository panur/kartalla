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
        var activeServices = [];
        var rootRoute = gtfsRoot.getRootRoute(routeIndex);
        for (var i = 0; i < getServices(rootRoute).length; i++) {
            var service = new GtfsService(gtfsRoot, that, i);
            if (service.isActive('20151224')) { // tbd
                activeServices.push(service);
            }
        }
        return activeServices;
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

    this.getShape = function (shapeIndex) {
        var rootRoute = gtfsRoot.getRootRoute(routeIndex);
        return rootRoute[2][shapeIndex];
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

    this.getShape = function (shapeIndex) {
        return gtfsRoute.getShape(shapeIndex);
    }

    this.isActive = function (dateString) {  // dateString = YYYYMMDD
        var rootService = gtfsRoute.getRootService(serviceIndex);
        var exceptionDates = getExceptionDates(rootService);

        if (exceptionDates.added.indexOf(dateString) != -1) {
            return true;
        } else if (exceptionDates.removed.indexOf(dateString) != -1) {
            return false;
        } else if (getWeekDay(rootService) == getDateWeekDay(dateString)) {
            var startDay = getStartDay(rootService);
            var endDay = getEndDay(rootService);
            return ((dateString >= startDay) && (dateString <= endDay));
        } else {
            return false;
        }
    }

    function getDateWeekDay(dateString) { // dateString = YYYYMMDD
        var date = new Date(dateString.substring(0, 4), dateString.substring(4, 6) - 1,
                            dateString.substring(6, 8));
        return (date.getDay() + 6) % 7; // 0=Monday
    }

    this.getActiveTrips = function () {
        var activeTrips = [];
        var serviceDirections = getServiceDirections();
        for (var i = 0; i < serviceDirections.length; i++) {
            var direction = new GtfsDirection(gtfsRoot, that, serviceDirections[i]);
            activeTrips = activeTrips.concat(direction.getActiveTrips(344));  // tbd
        }
        return activeTrips;
    }

    function getServiceDirections() {
        var rootService = gtfsRoute.getRootService(serviceIndex);
        var directionsI = getDirectionsI(rootService);
        var routeDirections = gtfsRoute.getDirections();
        return routeDirections[directionsI];
    }

    // 0=start_date_i, 1=end_date_i, 2=weekday, 3=exception_dates, 4=directions_i
    function getStartDay(rootService) {
        return gtfsRoot.getDates()[rootService[0]];
    }

    function getEndDay(rootService) {
        return gtfsRoot.getDates()[rootService[1]];
    }

    function getWeekDay(rootService) {
        return rootService[2]; // 0=Monday
    }

    function getExceptionDates(rootService) {
        var exceptionDates = rootService[3];
        var addedDates = exceptionDates [0];
        var removedDates = exceptionDates [1];
        return {added: getDateStrings(addedDates), removed: getDateStrings(removedDates)};
    }

    function getDateStrings(dateIndexes) {
        var rootDates = gtfsRoot.getDates();
        var dateStrings = [];
        for (var i = 0; i < dateIndexes.length; i++) {
            dateStrings.push(rootDates[dateIndexes[i]]);
        }
        return dateStrings;
    }

    function getDirectionsI(rootService) {
        return rootService[4];
    }
}

function GtfsDirection(gtfsRoot, gtfsService, rootDirection) {
    var that = this;

    // 0=shape_i, 1=stop_distances, 2=is_departure_times, 3=stop_times, 4=trips
    this.getShape = function () {
        return gtfsService.getShape(rootDirection[0]);
    }

    this.getActiveTrips = function (minutesAfterMidnight) {  // tbd: add threshold
        var activeTrips = [];
        var directionTrips = rootDirection[4];
        var firstStartTime = directionTrips[0];
        var startTimes =
            gtfsRoot.unpack_delta_list(gtfsRoot.string_to_integer_list(directionTrips[1]));
        var stopTimesIndexes = gtfsRoot.string_to_integer_list(directionTrips[2]);

        for (var i = 0; i < startTimes.length; i++) {
            var startTime = firstStartTime + startTimes[i];
            var stopTimes = getStopTimes(stopTimesIndexes[i]);
            if ((startTime < minutesAfterMidnight) &&
                ((startTime + stopTimes[stopTimes.length - 1]) > minutesAfterMidnight)) {
                var artiveTrip = new GtfsTrip(gtfsRoot, that, startTime, stopTimes);
                activeTrips.push(artiveTrip);
            }
        }
        return activeTrips;
    }

    function getStopTimes(stopTimesI) {
        var stopTimes = rootDirection[3][stopTimesI];
        return gtfsRoot.unpack_delta_list(gtfsRoot.string_to_integer_list(stopTimes));
    }

    this.getStopDistances = function () {
        return gtfsRoot.unpack_delta_list(gtfsRoot.string_to_integer_list(rootDirection[1]));
    }
}

function GtfsTrip(gtfsRoot, gtfsDirection, startTime, stopTimes) {
    var that = this;

    this.getStartTime = function () {
        return startTime;
    }

    this.getStopTimes = function () {
        return stopTimes;
    }

    this.getShape = function () {
        return gtfsDirection.getShape();
    }

    this.getStopDistances = function () {
        return gtfsDirection.getStopDistances();
    }
}
