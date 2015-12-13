/* Author: Panu Ranta, panu.ranta@iki.fi */

function main() {
    var utils = new Utils();
    var map = new Map();
    map.init();
    var gtfs = new Gtfs();
    var controller = new Controller(gtfs, map);

    var readyEvent = document.createEvent('Event');
    readyEvent.initEvent('gtfsDownloadIsReady', false, false);
    document.addEventListener('gtfsDownloadIsReady', downloadIsReady, false);

    var startTime = new Date();
    var gtfsJsonData = null;

    utils.downloadUrl('json/132.json', downloadProgressHandler, function (data) {
        gtfsJsonData = JSON.parse(data);
        document.dispatchEvent(readyEvent);
    });

    function downloadProgressHandler(event) {
        console.log('tuppa: %o', event.total);
        if (event.lengthComputable) {
            console.log('huppa: %o', event.loaded / event.total);
        } else {
            console.log('nuppa: %o', event);
        }
    }

    function downloadIsReady() {
        console.log('GTFS JSON downloading took %d ms',
                    Math.round((new Date()).getTime() - startTime.getTime()));
        gtfs.init(gtfsJsonData);
        controller.start();
    }
}
