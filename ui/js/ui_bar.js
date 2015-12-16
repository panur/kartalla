/* Author: Panu Ranta, panu.ranta@iki.fi */

function UiBar() {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        return s;
    }

    this.init = function (tripTypes) {
        var uiBarElement = document.getElementById('ui_bar');

        var line1Element = createElement('div', 'uiLine1');
        line1Element.appendChild(createElement('span', 'clock'));
        line1Element.appendChild(createTextElement(' | '));
        line1Element.appendChild(createStatisticsElement(tripTypes));
        uiBarElement.appendChild(line1Element);

        var line2Element = createElement('div', 'uiLine2');
        line2Element.appendChild(createJsonDataElement());
        line2Element.appendChild(createTextElement(' | '));
        line2Element.appendChild(createAboutLinkElement());
        uiBarElement.appendChild(line2Element);
    }

    function createStatisticsElement(tripTypes) {
        var statisticsElement = createElement('span', 'statistics');

        for (var tripTypeName in tripTypes) {
            var statisticsTitle = getStatisticsTitle(tripTypeName);
            if (statisticsElement.hasChildNodes()) {
                statisticsTitle = ', ' + statisticsTitle;
            }
            var titleElement = createTextElement(statisticsTitle + ': ');
            titleElement.style.color = tripTypes[tripTypeName].color;
            statisticsElement.appendChild(titleElement);
            var elementId = tripTypeName + 'Count';
            statisticsElement.appendChild(createElement('span', elementId, '-'));
        }

        return statisticsElement;
    }

    function getStatisticsTitle(tripTypeName) {
        return {'bus': 'busseja', 'train': 'junia', 'tram': 'ratikoita',
                'metro': 'metroja', 'ferry': 'lauttoja'}[tripTypeName];
    }

    function createJsonDataElement() {
        var jsonDataElement = createElement('span', 'jsonData');
        jsonDataElement.appendChild(createTextElement('Data: '));
        jsonDataElement.appendChild(createElement('span', 'downloadStatus'));
        return jsonDataElement;
    }

    function createAboutLinkElement() {
        var aboutLinkElement = document.createElement('a');
        aboutLinkElement.href = 'about/';
        aboutLinkElement.textContent = 'tietoja';
        return aboutLinkElement;
    }

    function createElement(elementType, elementId, textContent) {
        var newElement = document.createElement(elementType);
        newElement.id = elementId;
        if (textContent != undefined) {
            newElement.textContent = textContent;
        }
        return newElement;
    }

    function createTextElement(textContent) {
        var newElement = document.createElement('span');
        newElement.textContent = textContent;
        return newElement;
    }

    function setElementText(elementId, textContent) {
        document.getElementById(elementId).textContent = textContent;
    }

    this.updateDownloadProgress = function (progressEvent) {
        var downloadStatus = 'ladataan...';
        if (progressEvent.lengthComputable) {
            downloadStatus = Math.round(100 * (progressEvent.loaded / progressEvent.total));
        }
        setElementText('downloadStatus', downloadStatus);
    }

    this.updateClock = function (date) {
        setElementText('clock', date.toLocaleDateString() + ' ' + date.toLocaleTimeString());
    }

    this.updateStatistics = function (tripTypes) {
        for (var tripTypeName in tripTypes) {
            var elementId = tripTypeName + 'Count'
            setElementText(elementId, tripTypes[tripTypeName].count);
        }
    }
}
