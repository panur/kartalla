/* Author: Panu Ranta, panu.ranta@iki.fi */

function UiBar() {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.statisticsTypes = getStatisticsTypes();
        return s;
    }

    function getStatisticsTypes() {
        return [getStatisticsType('busseja', 'bus'), getStatisticsType('junia', 'train'),
                getStatisticsType('ratikoita', 'tram'), getStatisticsType('metroja', 'metro'),
                getStatisticsType('lauttoja', 'ferry')];
    }

    function getStatisticsType(title, type) {
        return {title: title, type: type};
    }

    this.init = function () {
        var uiBarElement = document.getElementById('ui_bar');

        var line1Element = createElement('div', 'uiLine1');
        line1Element.appendChild(createElement('span', 'clock'));
        line1Element.appendChild(createTextElement(' | '));
        line1Element.appendChild(createStatisticsElement());
        uiBarElement.appendChild(line1Element);

        var line2Element = createElement('div', 'uiLine2');
        line2Element.appendChild(createJsonDataElement());
        line2Element.appendChild(createTextElement(' | '));
        line2Element.appendChild(createAboutLinkElement());
        uiBarElement.appendChild(line2Element);
    }

    function createStatisticsElement() {
        var statisticsElement = createElement('span', 'statistics');

        for (var i = 0; i < state.statisticsTypes.length; i++) {
            var statisticsTitle = state.statisticsTypes[i].title;
            if (i > 0) {
                statisticsTitle = ', ' + statisticsTitle;
            }
            statisticsElement.appendChild(createTextElement(statisticsTitle + ': '));
            var elementId = state.statisticsTypes[i].type + 'Count';
            statisticsElement.appendChild(createElement('span', elementId, '-'));
        }

        return statisticsElement;
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
        aboutLinkElement.innerHTML = 'tietoja';
        return aboutLinkElement;
    }

    function createElement(elementType, elementId, textContent) {
        var newElement = document.createElement(elementType);
        newElement.id = elementId;
        if (textContent != undefined) {
            newElement.innerHTML = textContent;
        }
        return newElement;
    }

    function createTextElement(textContent) {
        var newElement = document.createElement('span');
        newElement.innerHTML = textContent;
        return newElement;
    }

    function setElementText(elementId, textContent) {
        document.getElementById(elementId).innerHTML = textContent;
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

    this.updateStatistics = function (statistics) {
        for (var i = 0; i < state.statisticsTypes.length; i++) {
            var statisticsType = state.statisticsTypes[i].type;
            var elementId = statisticsType + 'Count'
            var count = 0;
            if (statistics[statisticsType] != undefined) {
                count = statistics[statisticsType];
            }
            setElementText(elementId, count);
        }
    }
}
