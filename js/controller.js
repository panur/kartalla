/* Author: Panu Ranta, panu.ranta@iki.fi */

function Controller(gtfs, map) {
    var that = this; /* http://javascript.crockford.com/private.html */
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

        console.log('now, real: %o, fake: %o', new Date(), nowDate);

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

        for (var tripId in state.activeTrips) {
            state.activeTrips[tripId].update(getSecondsAfterMidnight(nowDate));
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
        s.marker = null;
        return s;
    }

    function mergeStopTimesAndDistances(times, distances) {
        var timesAndDistances = [];
        while (times.length > 3) {
            if (times[times.length - 1] == times[times.length - 2]) {
                times.splice(times.length - 2, 1);
                distances.splice(distances.length - 2, 1);
            } else {
                break;
            }
        }

        for (var i = 1; i < times.length; i++) {
            if ((i < (times.length - 1)) && (times[i] == times[i + 1])) {
                var distance = Math.round((distances[i] + distances[i + 1]) / 2);
                timesAndDistances.push([times[i], distance]);
                i++;
            } else {
                timesAndDistances.push([times[i], distances[i]]);
            }
        }
        return timesAndDistances;
    }

    this.update = function (secondsAfterMidnight) {
        var secondsFromStart = secondsAfterMidnight - (startTime * 60);
        if (secondsFromStart > 0) {
            var distance = getDistance(secondsFromStart, state.timesAndDistances);
            console.log('updating trip: startTime=%d, secondsFromStart=%d, distance=%d',
                        startTime, secondsFromStart, distance);
            if (state.marker != null) {
                map.removeMarker(state.marker);
            }
            state.marker = map.addMarker(tripPath, distance);
        }
    }

    function getDistance(secondsFromStart, timesAndDistances) {
        var distance = 0;
        var cumulSeconds = 0;
        var cumulDistance = 0;

        for (var i = 0; i < timesAndDistances.length - 1; i++) {
            var secondsInc = (timesAndDistances[i + 1][0] - timesAndDistances[i][0]) * 60;
            cumulSeconds += secondsInc;
            var distanceInc = (timesAndDistances[i + 1][1] - timesAndDistances[i][1]);
            cumulDistance += distanceInc;
            if (cumulSeconds <= secondsFromStart) {
                if (cumulSeconds == secondsFromStart) {
                    distance = cumulDistance;
                    break;
                }
            } else {
                var secondsSincePreviousDelta = secondsFromStart - (cumulSeconds - secondsInc);
                var fraction = secondsSincePreviousDelta / secondsInc;
                distance = (cumulDistance - distanceInc) + (fraction * distanceInc);
                break;
            }
        }

        return Math.round(distance);
    }
}
