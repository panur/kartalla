/* Author: Panu Ranta, panu.ranta@iki.fi */

function main() {
    var utils = new Utils();
    var uiBar = new UiBar();
    uiBar.init();
    var map = new Map();
    map.init();
    var gtfs = new Gtfs();
    var controller = new Controller(gtfs, map, uiBar);

    window.onresize = resizeMap;
    resizeMap();

    var readyEvent = document.createEvent('Event');
    readyEvent.initEvent('gtfsDownloadIsReady', false, false);
    document.addEventListener('gtfsDownloadIsReady', downloadIsReady, false);

    var startTime = new Date();
    var gtfsJsonData = null;

    utils.downloadUrl('json/132.json', uiBar.updateDownloadProgress, function (data) {
        gtfsJsonData = JSON.parse(data);
        document.dispatchEvent(readyEvent);
    });

    function downloadIsReady() {
        console.log('GTFS JSON downloading took %d ms',
                    Math.round((new Date()).getTime() - startTime.getTime()));
        gtfs.init(gtfsJsonData);
        controller.start();
    }

    function resizeMap() {
        var mapHeight = document.documentElement.clientHeight -
            document.getElementById('ui_bar').clientHeight;
        map.resize(mapHeight);
    }
}
