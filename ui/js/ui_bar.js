/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

'use strict';

function UiBar() {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.lang = null;
        s.tripTypeInfos = null;
        return s;
    }

    this.init = function (lang, tripTypeInfos) {
        state.lang = lang;
        state.tripTypeInfos = tripTypeInfos;

        var uiBarElement = document.getElementById('ui_bar');
        uiBarElement.innerHTML = '';

        var line1Element = createElement('div');
        line1Element.appendChild(createElement('span', 'clock'));
        line1Element.appendChild(createTextElement(' | '));
        line1Element.appendChild(createTripTypeElement());
        uiBarElement.appendChild(line1Element);

        var line2Element = createElement('div');
        line2Element.appendChild(createLanguageElement());
        line2Element.appendChild(createTextElement(' | '));
        line2Element.appendChild(createJsonDataElement());
        line2Element.appendChild(createTextElement(' | '));
        line2Element.appendChild(createAboutLinkElement());
        uiBarElement.appendChild(line2Element);
    };

    function createTripTypeElement() {
        var tripTypes = state.tripTypeInfos.getTypes();
        var tripTypeNames = state.tripTypeInfos.getNames();
        var tripTypeElement = createElement('span');

        for (var i = 0; i < tripTypeNames.length; i++) {
            var tripTypeName = tripTypeNames[i];
            var statisticsTitle = getStatisticsTitle(tripTypeName);
            var titleElement = createTextElement(statisticsTitle + ': ');
            titleElement.style.color = tripTypes[tripTypeName].color;
            tripTypeElement.appendChild(titleElement);
            var elementId = tripTypeName + 'Count';
            tripTypeElement.appendChild(createElement('span', elementId, '-'));
            tripTypeElement.appendChild(createTextElement(' '));
            var tripTypeVisibilityElement =
                createTripTypeVisibilityElement(tripTypeName, tripTypes[tripTypeName]);
            tripTypeElement.appendChild(tripTypeVisibilityElement);
            if (i < (tripTypeNames.length - 1)) {
                tripTypeElement.appendChild(createTextElement(', '));
            }
        }

        return tripTypeElement;
    }

    function getStatisticsTitle(tripTypeName) {
        if (state.lang === 'fi') {
            return {'bus': 'busseja', 'train': 'junia', 'tram': 'ratikoita',
                    'metro': 'metroja', 'ferry': 'lauttoja'}[tripTypeName];
        } else {
            return {'bus': 'buses', 'train': 'trains', 'tram': 'trams',
                    'metro': 'metros', 'ferry': 'ferries'}[tripTypeName];
        }
    }

    function createTripTypeVisibilityElement(tripTypeName, tripType) {
        var visibilityElement = createElement('span');
        updateTripTypeVisibilityElement(visibilityElement, tripType.isVisible);
        visibilityElement.className = 'visibilityButton';
        visibilityElement.addEventListener('click', function () {
            state.tripTypeInfos.toggleVisibility(tripTypeName);
            updateTripTypeVisibilityElement(visibilityElement, tripType.isVisible);
        });
        return visibilityElement;
    }

    function updateTripTypeVisibilityElement(visibilityElement, isVisible) {
        var showText = {'en': 'show', 'fi': 'näytä'}[state.lang];
        var hideText = {'en': 'hide', 'fi': 'piilota'}[state.lang];
        visibilityElement.title = {false: showText, true: hideText}[isVisible];
        visibilityElement.textContent = '(' + visibilityElement.title.charAt(0) + ')';
    }

    function createLanguageElement() {
        var languageElement = createElement('span');
        if (state.lang === 'fi') {
            languageElement.appendChild(createTextElement('Kieli: suomi / '));
            var linkElement = createElement('a', undefined, 'English');
            linkElement.href = 'index.en.html';
            linkElement.title = 'show English version of this page';
            languageElement.appendChild(linkElement);
        } else {
            languageElement.appendChild(createTextElement('Language: '));
            var linkElement = createElement('a', undefined, 'suomi');
            linkElement.href = 'index.fi.html';
            linkElement.title = 'näytä sivun suomenkielinen versio';
            languageElement.appendChild(linkElement);
            languageElement.appendChild(createTextElement(' / English'));
        }
        return languageElement;
    }

    function createJsonDataElement() {
        var jsonDataElement = createElement('span');
        jsonDataElement.appendChild(createTextElement('Data: '));
        jsonDataElement.appendChild(createElement('span', 'dataStatus'));
        return jsonDataElement;
    }

    function createAboutLinkElement() {
        var linkName = {'en': 'about', 'fi': 'tietoja'}[state.lang];
        var aboutLinkElement = createElement('a', undefined, linkName);
        aboutLinkElement.href = linkName + '.html';
        return aboutLinkElement;
    }

    function createElement(elementType, elementId, textContent) {
        var newElement = document.createElement(elementType);
        if (elementId !== undefined) {
            newElement.id = elementId;
        }
        if (textContent !== undefined) {
            newElement.textContent = textContent;
        }
        return newElement;
    }

    function createTextElement(textContent) {
        return createElement('span', undefined, textContent);
    }

    function setElementText(elementId, textContent) {
        document.getElementById(elementId).textContent = textContent;
    }

    this.updateDownloadProgress = function (progressEvent) {
        var loaded = getMegaBytes(progressEvent.loaded);
        var statusText = {'en': 'downloaded (megabytes)', 'fi': 'ladattu (megatavua)'}[state.lang];
        setElementText('dataStatus', statusText + ' ' + loaded + '...');
    };

    function getMegaBytes(bytes) {
        return ((bytes / 1024) / 1024).toFixed(1);
    }

    this.setDataInfo = function (dtfsEpoch, jsonEpoch, downloadDuration, sizeBytes) {
        setElementText('dataStatus', 'OK');
        var infoElement = createElement('span', undefined, '*');
        infoElement.className = 'dataInfo';
        infoElement.title = getDataInfoTitle({'gtfsDate': epochToString(dtfsEpoch, false),
            'jsonDate': epochToString(jsonEpoch, true), 'download': downloadDuration,
            'size': getMegaBytes(sizeBytes)});
        document.getElementById('dataStatus').appendChild(infoElement);
    };

    function epochToString(epoch, isTimeIncluded) {
        return dateToString(new Date(epoch * 1000), isTimeIncluded);
    }

    function dateToString(d, isTimeIncluded) {
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
    }

    function getDataInfoTitle(dataInfo) {
        var titleItems = ['gtfsDate', 'jsonDate', 'download', 'size'];
        var dataInfoTitle = '';
        for (var i = 0; i < titleItems.length; i++) {
            dataInfoTitle += getDataInfoItemName(titleItems[i]) + ': ' + dataInfo[titleItems[i]];
            if (i < (titleItems.length - 1)) {
                dataInfoTitle += '\n';
            }
        }
        return dataInfoTitle;
    }

    function getDataInfoItemName(dataInfoItem) {
        if (state.lang === 'fi') {
            return {'gtfsDate': 'GTFS', 'jsonDate': 'JSON', 'download': 'Lataus (sekuntia)',
                    'size': 'Koko (megatavua)'}[dataInfoItem];
        } else {
            return {'gtfsDate': 'GTFS', 'jsonDate': 'JSON', 'download': 'Download (seconds)',
                    'size': 'Size (megabytes)'}[dataInfoItem];
        }
    }

    this.updateClock = function (date) {
        setElementText('clock', dateToString(date, true));
    };

    this.updateStatistics = function () {
        var tripTypes = state.tripTypeInfos.getTypes();
        for (var tripTypeName in tripTypes) {
            var elementId = tripTypeName + 'Count';
            setElementText(elementId, tripTypes[tripTypeName].count);
        }
    };
}
