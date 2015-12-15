/* Author: Panu Ranta, panu.ranta@iki.fi */

'use strict';  // tbd

function Controller(gtfs, map) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.initialStatistics = document.getElementById("statistics").innerHTML;
        s.timing = {startFake: null, startReal: null, tickMs: 1000, speedMultiplier: 15,
                    nextTripUpdate: 0, intervalId: null};
        s.activeServicesDateString = null;
        s.activeServices = [];
        s.activeTrips = {};
        return s;
    }

    this.init = function () {
        //huppa();
    }

    this.start = function () {
        state.timing.startFake = new Date('2015-12-24T05:42:00'); // tbd
        state.timing.startReal = new Date();
        console.log('start, real: %o, fake: %o', state.timing.startReal, state.timing.startFake);
        state.timing.intervalId =
            window.setInterval(function () {processTick();}, state.timing.tickMs);
    }

    function processTick() {
        var nowDate = getNowDate();
        var nowDateString = getDateString(nowDate);

        if ((nowDate.getTime() - state.timing.startFake.getTime()) > 1250000) {
            window.clearInterval(state.timing.intervalId); // tbd
            console.log('stopped');
        }

        // console.log('now, real: %o, fake: %o', new Date(), nowDate);

        if (state.activeServicesDateString != nowDateString) {
            state.activeServices = getActiveServices(nowDateString);
            state.activeServicesDateString = nowDateString;
        }

        if (nowDate.getTime() > state.timing.nextTripUpdate) {
            var updatePeriodInMinutes = 10;
            state.timing.nextTripUpdate = nowDate.getTime() + (updatePeriodInMinutes * 60 * 1000);
            var minutesAfterMidnight = Math.round(getSecondsAfterMidnight(nowDate) / 60);
            updateActiveTrips(minutesAfterMidnight, minutesAfterMidnight + updatePeriodInMinutes);
        }

        var tripsToBeDeleted = [];
        for (var tripId in state.activeTrips) {
            var canBeDeleted = state.activeTrips[tripId].update(getSecondsAfterMidnight(nowDate));
            if (canBeDeleted) {
                tripsToBeDeleted.push(tripId);
            }
        }
        for (var i = 0; i < tripsToBeDeleted.length; i++) {
            delete state.activeTrips[tripsToBeDeleted[i]];
            console.log('deleted: %o', tripsToBeDeleted[i]);
        }
    }

    function getNowDate() {
        var realMsFromStart = (new Date()).getTime() - state.timing.startReal.getTime();
        var fakeMsFromStart = realMsFromStart * state.timing.speedMultiplier;
        return new Date(state.timing.startFake.getTime() + fakeMsFromStart);
    }

    function getDateString(date) {
        return '' + date.getFullYear() + (date.getMonth() + 1) + date.getDate();
    }

    function getSecondsAfterMidnight(date) {
        var minutesAfterMidnight = (date.getHours() * 60) + date.getMinutes();
        return (minutesAfterMidnight * 60) + date.getSeconds();
    }

    function getActiveServices(dateString) { // dateString = YYYYMMDD
        var activeServices = [];
        var routes = gtfs.getRoutes();
        for (var i = 0; i < routes.length; i++) {
            if (routes[i].getName() == '132') { // tbd
                activeServices = activeServices.concat(routes[i].getActiveServices(dateString));
            }
        }
        console.log('found %d active services for %s', activeServices.length, dateString);
        return activeServices;
    }

    function updateActiveTrips(fromMinutesAfterMidnight, toMinutesAfterMidnight) {
        var numNewTrips = 0;
        for (var i = 0; i < state.activeServices.length; i++) {
            var activeTrips = state.activeServices[i].getActiveTrips(fromMinutesAfterMidnight,
                                                                     toMinutesAfterMidnight);
            for (var j = 0; j < activeTrips.length; j++) {
                var tripId = activeTrips[j].getId();
                if (state.activeTrips[tripId] == undefined) {
                    var tripPath = map.decodePath(activeTrips[j].getShape());
                    var distances = map.getDistances(tripPath,
                                                     activeTrips[j].getStopDistances());
                    var activeTrip = new ControllerTrip(map, tripPath, distances,
                                                        activeTrips[j].getStartTime(),
                                                        activeTrips[j].getStopTimes());
                    state.activeTrips[tripId] = activeTrip;
                    numNewTrips += 1;
                }
            }
        }
        console.log('found %d new active trips from %d to %d',
                    numNewTrips, fromMinutesAfterMidnight, toMinutesAfterMidnight);
    }
}

function ControllerTrip(map, tripPath, stopDistances, startTime, stopTimes) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.timesAndDistances = mergeStopTimesAndDistances(stopTimes, stopDistances);
        s.lastArrivalSeconds = s.timesAndDistances[s.timesAndDistances.length - 1].arrival * 60;
        s.polyline = map.addPolyline(tripPath);
        return s;
    }

    /* Merge stop times (arrival/departure) and distances into list of objects with unique arrival
    time (to simplify the calculation of distance from start when given seconds from start). The
    first and last stops are not modified but otherwise returned distances don't necessary match
    with any real stop. For times=[[0,0,0,0,2,2,3,3,3,3,4,4,6,6,6,6,6,6] and
    distances=[100,10,210,300,380,430,11,12,600] stops {0,0,10}, {6,6,11} and {6,6,12} are skipped
    and stops {3,3,300} and {3,3,380} are combined into {3,3,365} and what is finally returned is
    [{0,0,100},{2,2,210},{3,3,365},{4,4,430},{6,6,600}] */
    function mergeStopTimesAndDistances(times, distances) {
        var timesAndDistances = [];

        for (var i = 0; i < distances.length; i++) {
            var arrivalTime = times[i * 2];
            var departureTime = times[(i * 2) + 1];
            var distance = distances[i];
            if (arrivalTime == times[0]) {
                if (i != 0) {
                    distance = undefined; // skip if same as 1st but not 1st
                }
            } else if (arrivalTime == times[times.length - 2]) {
                if (i != (distances.length - 1)) {
                    distance = undefined; // skip if same as last but not last
                }
            } else {
                var sameArrivals = getSameArrivals(times, i * 2);
                if (sameArrivals > 0) { // many stops with same arrival time
                    distance = Math.round((distances[i] + distances[i + sameArrivals + 1]) / 2);
                    i += sameArrivals; // save the first with average distance, skip the rest
                }
            }

            if (distance != undefined) {
                timesAndDistances.push({arrival: arrivalTime, departure: departureTime,
                                        distance: distance})
            }
        }
        return timesAndDistances;
    }

    function getSameArrivals(times, startIndex) {
        var sameArrivals = 0;
        for (var i = startIndex + 2; i < times.length; i += 2) {
            if (times[i] == times[startIndex]) {
                sameArrivals += 1;
            }
        }
        return sameArrivals;
    }

    this.update = function (secondsAfterMidnight) {
        var canBeRemoved = false;
        var fadeSeconds = 60;
        var secondsFromStart = secondsAfterMidnight - (startTime * 60);

        if (secondsFromStart > (state.lastArrivalSeconds + fadeSeconds)) {
            map.removePolyline(state.polyline);
            canBeRemoved = true;
        } else if ((secondsFromStart >= -fadeSeconds) &&
            (secondsFromStart <= (state.lastArrivalSeconds + fadeSeconds))) {
            var distance = getDistanceFromStart(secondsFromStart, state.timesAndDistances);
            console.log('updating trip: startTime=%d, secondsFromStart=%d, distance=%d',
                        startTime, secondsFromStart, distance);
            var opacity = getPolylineOpacity(secondsFromStart, fadeSeconds);
            map.updatePolyline(state.polyline, distance, opacity);
        }

        return canBeRemoved;
    }

    function getDistanceFromStart(secondsFromStart, timesAndDistances) {
        var distance = 0;

        if (secondsFromStart <= 0) {
            distance = timesAndDistances[0].distance;
        } else if (secondsFromStart >= state.lastArrivalSeconds) {
            distance = timesAndDistances[timesAndDistances.length - 1].distance;
        } else {
            for (var i = 1; i < timesAndDistances.length; i++) {
                if (secondsFromStart > (timesAndDistances[i].departure * 60)) {
                    continue;
                } else if ((secondsFromStart >= (timesAndDistances[i].arrival * 60)) &&
                           (secondsFromStart <= (timesAndDistances[i].departure * 60))) {
                    distance = timesAndDistances[i].distance;
                    break;
                } else {
                    var secondsInc =
                        (timesAndDistances[i].arrival - timesAndDistances[i - 1].departure) * 60;
                    var distanceInc =
                        (timesAndDistances[i].distance - timesAndDistances[i - 1].distance);
                    var secondsSincePrevious =
                        secondsFromStart - (timesAndDistances[i - 1].departure * 60);
                    var fraction = secondsSincePrevious / secondsInc;
                    distance = timesAndDistances[i - 1].distance + (fraction * distanceInc);
                    break;
                }
            }
        }

        return Math.round(distance);
    }

    function getPolylineOpacity(secondsFromStart, fadeSeconds) {
        if (secondsFromStart < 0) {
            return (fadeSeconds + secondsFromStart) / fadeSeconds;
        } else if (secondsFromStart > state.lastArrivalSeconds) {
            return (fadeSeconds - (secondsFromStart - state.lastArrivalSeconds)) / fadeSeconds;
        } else {
            return 1.0;
        }
    }
}
