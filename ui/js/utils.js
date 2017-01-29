/* Author: Panu Ranta, panu.ranta@iki.fi, https://14142.net/kartalla/about.html */

'use strict';

function Utils() {
    var that = this;

    this.downloadUrl = function (url, progressHandler, responseHandler) {
        var request = new XMLHttpRequest();
        request.addEventListener('progress', progressHandler);

        request.onreadystatechange = function () {
            if (request.readyState === 4) {
                var status = request.status;
                if ((status === 0) || (status === 200)) {
                    responseHandler(request);
                    request.onreadystatechange = function () {};
                } else {
                    console.error('unexpected status: ' + status);
                }
            }
        };

        request.open('GET', url, true);
        if (url.indexOf('.json') !== -1) {
            request.overrideMimeType('application/json');
        }
        request.send();
    };

    this.dateToString = function (d, isTimeIncluded) {
        function pad(number) {
            if (number < 10) {
                return '0' + number;
            } else {
                return number;
            }
        }
        var dateString = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        if (isTimeIncluded) {
            dateString +=
                ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
        }
        return dateString;
    };

    this.setDomTooltipPosition = function (tooltipElement, rect) {
        var leftOffset = {true: 0,
            false: tooltipElement.offsetWidth}[rect.left < (window.innerWidth / 2)];
        tooltipElement.style.left = Math.max(0, rect.left - leftOffset) + 'px';
        var topOffset = {true: -rect.height,
            false: tooltipElement.offsetHeight}[rect.top < (window.innerHeight / 2)];
        tooltipElement.style.top = (rect.top - topOffset) + 'px';
    };
}
