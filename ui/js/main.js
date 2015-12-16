/* Author: Panu Ranta, panu.ranta@iki.fi */

function main() {
    var utils = new Utils();
    var uiBar = new UiBar();
    var map = new Map();
    var gtfs = new Gtfs();
    var controller = new Controller(gtfs, map, uiBar);
    var timing = new Timing(uiBar, controller);

    uiBar.init();
    timing.init();
    map.init();

    initResizeHandler();

    downloadGtfsJsonData('json/gtfs.json');

    function downloadGtfsJsonData(filename) {
        var readyEvent = document.createEvent('Event');
        readyEvent.initEvent('gtfsDownloadIsReady', false, false);
        document.addEventListener('gtfsDownloadIsReady', downloadIsReady, false);

        var startTime = new Date();
        var gtfsJsonData = null;

        utils.downloadUrl(filename, uiBar.updateDownloadProgress, function (data) {
            gtfsJsonData = JSON.parse(data);
            document.dispatchEvent(readyEvent);
        });

        function downloadIsReady() {
            console.log('GTFS JSON downloading took %d ms',
                        Math.round((new Date()).getTime() - startTime.getTime()));
            gtfs.init(gtfsJsonData);
            timing.downloadIsReady();
        }
    }

    function initResizeHandler() {
        window.onresize = resizeMap;

        resizeMap();

        function resizeMap() {
            var mapHeight = document.documentElement.clientHeight -
                document.getElementById('ui_bar').clientHeight;
            map.resize(mapHeight);
        }
    }
}

function Timing(uiBar, controller) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.startFake = null;
        s.startReal = null;
        s.tickMs = 1000;
        s.speedMultiplier = 15;
        s.intervalId = null;
        s.downloadIsReady = false;
        return s;
    }

    this.init = function() {
        state.startFake = new Date('2015-12-24T05:42:00'); // tbd
        state.startReal = new Date();
        console.log('start, real: %o, fake: %o', state.startReal, state.startFake);
        state.intervalId = window.setInterval(function () {processTick();}, state.tickMs);
        uiBar.updateClock(getNowDate());
    }

    function processTick() {
        var nowDate = getNowDate();

        if ((nowDate.getTime() - state.startFake.getTime()) > 1250000) {
            window.clearInterval(state.intervalId); // tbd
            console.log('stopped');
        }

        uiBar.updateClock(nowDate);
        if (state.downloadIsReady) {
            controller.update(nowDate);
        }
    }

    function getNowDate() {
        var realMsFromStart = (new Date()).getTime() - state.startReal.getTime();
        var fakeMsFromStart = realMsFromStart * state.speedMultiplier;
        return new Date(state.startFake.getTime() + fakeMsFromStart);
    }

    this.downloadIsReady = function() {
        state.downloadIsReady = true;
    }
}
