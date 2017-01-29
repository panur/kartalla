/* Author: Panu Ranta, panu.ranta@iki.fi, https://14142.net/kartalla/about.html */

'use strict';

function main() {
    console.log('Heppa luppa!');
    var utils = new Utils();
    var config = new Config(utils);
    var uiBar = new UiBar(utils);
    var map = new Map(utils);
    var gtfs = new Gtfs();
    var controller = new Controller(gtfs, map);
    var alerts = new HslAlerts(controller, uiBar);
    var timing = new Timing(alerts, controller, uiBar);
    var tripTypeInfos = new TripTypeInfos(controller, uiBar);
    var mqtt = new HslMqtt(utils, controller, uiBar);

    tripTypeInfos.init(config.vehicleTypes, config.visibleTypes);
    alerts.init(config.isAlertsUsed, config.lang);
    mqtt.init(config.isVpUsed);
    uiBar.init(config.lang, tripTypeInfos, createAlertsInfo(), onUiBarVisibilityChange,
               createDataSelection(), createMapSelection(), createPositionType(), getUrlParams);
    controller.init(config.lang, config.onlyRoutes, tripTypeInfos, config.interval);
    timing.init(config);
    map.init(config.lang, config.mapLat, config.mapLng, config.mapZoomLevel);

    initResizeHandler();

    downloadGtfsJsonData(config.jsonUrl);

    function downloadGtfsJsonData(filename) {
        var readyEventName = 'gtfsDownloadIsReady';
        var readyEvent = document.createEvent('Event');
        readyEvent.initEvent(readyEventName, false, false);
        document.addEventListener(readyEventName, downloadIsReady, false);

        var startTime = new Date();
        var downloadRequest = null;

        utils.downloadUrl(filename, uiBar.updateDownloadProgress, function (request) {
            downloadRequest = request;
            document.dispatchEvent(readyEvent);
        });

        function downloadIsReady() {
            document.removeEventListener(readyEventName, downloadIsReady, false);
            var duration = (((new Date()).getTime() - startTime.getTime()) / 1000).toFixed(1);
            gtfs.init(JSON.parse(downloadRequest.responseText));
            uiBar.setDataInfo(gtfs.getDtfsEpoch(), gtfs.getJsonEpoch(),
                              downloadRequest.responseText.length, duration,
                              isDownloadCompressed(), mqtt.getDataCount);
            timing.downloadIsReady();
            window.onresize();
            if (mqtt.isVpUsed()) {
                mqtt.connect();
            }
        }

        function isDownloadCompressed() {
            var contentEncoding = downloadRequest.getResponseHeader('Content-Encoding');
            return ((contentEncoding !== null) && (contentEncoding === 'gzip'));
        }
    }

    function initResizeHandler() {
        window.onresize = resizeMap;

        resizeMap();

        function resizeMap() {
            var mapHeight = document.documentElement.clientHeight;
            if (document.getElementById('ui_bar').style.visibility !== 'hidden') {
                mapHeight -= document.getElementById('ui_bar').clientHeight;
            }
            map.resize(mapHeight);
        }
    }

    function createAlertsInfo() {
        return {'isUsed': alerts.isUsed};
    }

    function onUiBarVisibilityChange(controlElement) {
        map.toggleUiBarControl(controlElement);
        window.onresize();
    }

    function createDataSelection() {
        var names = ['HSL', 'Suomi', 'VR', 'Hämeenlinna', 'Joensuu', 'Jyväskylä', 'Kotka',
            'Kouvola', 'Kuopio', 'Lahti', 'Lappeenranta', 'Mikkeli', 'Oulu', 'Tampere', 'Turku',
            'Vaasa'];
        var selectedData = getDataTypeName(names, config.dataType);
        return {values: names, selectedValue: selectedData, changeType : function (newType) {
            config.restart(getDataType(newType));
            tripTypeInfos.restart(config.vehicleTypes, config.visibleTypes);
            alerts.restart(config.isAlertsUsed);
            mqtt.restart(config.isVpUsed);
            uiBar.restart();
            controller.restart();
            timing.restart();
            map.restart(config.mapLat, config.mapLng, config.mapZoomLevel);
            window.onresize();
            downloadGtfsJsonData(config.jsonUrl);
        }};
    }

    function getDataTypeName(dataTypeNames, dataType) {
        for (var i = 0; i < dataTypeNames.length; i++) {
            if (getDataType(dataTypeNames[i]) == dataType) {
                return dataTypeNames[i];
            }
        }
        console.error('No %o in %o', dataType, dataTypeNames);
        return null;
    }

    function getDataType(dataTypeName) {
        return dataTypeName.toLowerCase().replace(/ä/g, 'a');
    }

    function createMapSelection() {
        var maps = ['Leaflet', 'Google'];
        var selectedMap = {true: 'Leaflet', false: 'Google'}[document.URL.indexOf('gmap') === -1];
        return {values: maps, selectedValue: selectedMap, changeType : function (newType) {
            var filePrefix = {'Leaflet': 'index', 'Google': 'gmap'}[newType];
            window.location = filePrefix + '.' + config.lang + '.html';
        }};
    }

    function createPositionType() {
        return {'isVpUsed': mqtt.isVpUsed, 'toggleUsage': mqtt.toggleUsage};
    }

    function getUrlParams() {
        var tripTypes = tripTypeInfos.getTypes();
        return config.getShareLinkParamsList(map.getParams(), timing.getMapDate(), tripTypes,
                                             mqtt.isVpUsed());
    }
}

function Timing(alerts, controller, uiBar) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.startMapDate = null;
        s.startRealDate = null;
        s.tickMs = 1000;
        s.speedMultiplier = null;
        s.stopAfter = null;
        s.intervalId = null;
        s.downloadIsReady = false;
        return s;
    }

    this.init = function (config) {
        state.startMapDate = config.startDate;
        state.startRealDate = new Date();
        state.speedMultiplier = config.speed;
        state.stopAfter = config.stopAfter;
        state.intervalId = window.setInterval(function () {processTick();}, state.tickMs);
        uiBar.updateClock(that.getMapDate());
    };

    this.restart = function () {
        state.downloadIsReady = false;
    };

    function processTick() {
        var mapDate = that.getMapDate();

        uiBar.updateClock(mapDate);

        if (state.downloadIsReady) {
            controller.update(mapDate);
            alerts.update(mapDate);
        }

        if ((state.stopAfter !== null) && isTimeToStop(mapDate)) {
            window.clearInterval(state.intervalId);
            console.log('stopped after %d minutes', state.stopAfter);
        }
    }

    this.getMapDate = function () {
        var realMsFromStart = (new Date()).getTime() - state.startRealDate.getTime();
        var mapMsFromStart = realMsFromStart * state.speedMultiplier;
        return new Date(state.startMapDate.getTime() + mapMsFromStart);
    }

    function isTimeToStop(mapDate) {
        var minutesSinceStart = ((mapDate.getTime() - state.startMapDate.getTime()) / 1000) / 60;
        return minutesSinceStart > state.stopAfter;
    }

    this.downloadIsReady = function () {
        state.downloadIsReady = true;
    };
}

function TripTypeInfos(controller, uiBar) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.types = null;
        s.names = null;
        return s;
    }

    this.init = function (vehicleTypes, visibleTypes) {
        state.types = createTypes();
        for (var typeName in state.types) {
            state.types[typeName].isUsed = (vehicleTypes.indexOf(typeName) != -1);
            state.types[typeName].isVisible = (visibleTypes.indexOf(typeName) != -1);
        }
        state.names = vehicleTypes;
    }

    this.restart = function (vehicleTypes, visibleTypes) {
        that.init(vehicleTypes, visibleTypes);
    }

    function createTypes() {
        var types = {};
        types.bus = {isUsed: false, isVisible: false, color: '#007AC9', count: 0};
        types.train = {isUsed: false, isVisible: false, color: '#8C4799', count: 0};
        types.tram = {isUsed: false, isVisible: false, color: '#00985F', count: 0};
        types.metro = {isUsed: false, isVisible: false, color: '#FF6319', count: 0};
        types.ferry = {isUsed: false, isVisible: false, color: '#00B9E4', count: 0};
        types.airplane = {isUsed: false, isVisible: false, color: 'olive', count: 0};
        return types;
    }

    this.getType = function (tripTypeName) {
        return state.types[tripTypeName];
    };

    this.getTypes = function () {
        return state.types;
    };

    this.getNames = function () {
        return state.names;
    };

    this.resetStatistics = function () {
        for (var tripTypeName in state.types) {
            state.types[tripTypeName].count = 0;
        }
    };

    this.refreshStatistics = function () {
        uiBar.updateStatistics();
    };

    this.toggleVisibility = function (tripTypeName) {
        state.types[tripTypeName].isVisible = !state.types[tripTypeName].isVisible;
        controller.updateTripTypeVisibility(tripTypeName);
    };
}
