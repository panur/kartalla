/* Author: Panu Ranta, panu.ranta@iki.fi */

function main() {
    var utils = new Utils();
    var uiBar = new UiBar();
    var map = new Map();
    var gtfs = new Gtfs();
    var controller = new Controller(gtfs, map);
    var timing = new Timing(uiBar, controller);
    var tripTypeInfos = new TripTypeInfos(controller, uiBar);

    uiBar.init(getLang(), tripTypeInfos);
    controller.init(tripTypeInfos);
    timing.init();
    map.init();

    initResizeHandler();

    downloadGtfsJsonData('json/gtfs.json');

    function getLang() {
        if (document.documentElement.getAttribute('lang') === 'fi') {
            return 'fi';
        } else {
            return 'en';
        }
    }

    function downloadGtfsJsonData(filename) {
        var readyEvent = document.createEvent('Event');
        readyEvent.initEvent('gtfsDownloadIsReady', false, false);
        document.addEventListener('gtfsDownloadIsReady', downloadIsReady, false);

        var startTime = new Date();
        var gtfsJsonData = null;

        utils.downloadUrl(filename, uiBar.updateDownloadProgress, function (responseText) {
            gtfsJsonData = responseText;
            document.dispatchEvent(readyEvent);
        });

        function downloadIsReady() {
            var duration = (((new Date()).getTime() - startTime.getTime()) / 1000).toFixed(1);
            gtfs.init(JSON.parse(gtfsJsonData));
            uiBar.setDataInfo(gtfs.getDtfsEpoch(), gtfs.getJsonEpoch(), duration,
                              gtfsJsonData.length);
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

    this.init = function () {
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

    this.downloadIsReady = function () {
        state.downloadIsReady = true;
    }
}

function TripTypeInfos(controller, uiBar) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.types = createTypes();
        return s;
    }

    function createTypes() {
        var types = {}; // by name
        types.bus = {isVisible: true, color: 'blue', count: 0};
        types.train = {isVisible: false, color: 'red', count: 0};
        types.tram = {isVisible: false, color: 'green', count: 0};
        types.metro = {isVisible: false, color: 'orange', count: 0};
        types.ferry = {isVisible: false, color: 'purple', count: 0};
        return types;
    }

    this.getType = function (tripTypeName) {
        return state.types[tripTypeName];
    }

    this.getTypes = function () {
        return state.types;
    }

    this.resetStatistics = function () {
        for (var tripTypeName in state.types) {
            state.types[tripTypeName].count = 0;
        }
    }

    this.refreshStatistics = function () {
        uiBar.updateStatistics();
    }

    this.toggleVisibility = function (tripTypeName) {
        state.types[tripTypeName].isVisible = !state.types[tripTypeName].isVisible;
        controller.updateTripTypeVisibility(tripTypeName);
    }
}
