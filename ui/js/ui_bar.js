/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

'use strict';

function UiBar(utils) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.lang = null;
        s.tripTypeInfos = null;
        return s;
    }

    this.init = function (lang, tripTypeInfos, onUiBarVisibilityChange, dataSelection, mapSelection,
                          getUrlParams) {
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
        line2Element.appendChild(createHideElement(onUiBarVisibilityChange));
        line2Element.appendChild(createTextElement(' | '));
        line2Element.appendChild(createLanguageElement(mapSelection.selectedValue));
        line2Element.appendChild(createTextElement(' | '));
        line2Element.appendChild(createJsonDataElement(dataSelection));
        line2Element.appendChild(createTextElement(' | '));
        line2Element.appendChild(createMapSelectionElement(mapSelection));
        line2Element.appendChild(createTextElement(' | '));
        line2Element.appendChild(createShareElement(getUrlParams, mapSelection.selectedValue));
        line2Element.appendChild(createTextElement(' | '));
        line2Element.appendChild(createAboutLinkElement());
        uiBarElement.appendChild(line2Element);
    };

    this.restart = function () {
        var oldTripTypeElement = document.getElementById('tripType');
        var newTripTypeElement = createTripTypeElement();
        oldTripTypeElement.parentNode.replaceChild(newTripTypeElement, oldTripTypeElement);
    }

    function createTripTypeElement() {
        var tripTypes = state.tripTypeInfos.getTypes();
        var tripTypeNames = state.tripTypeInfos.getNames();
        var tripTypeElement = createElement('span', 'tripType');

        for (var i = 0; i < tripTypeNames.length; i++) {
            var tripTypeName = tripTypeNames[i];
            var statisticsTitle = getStatisticsTitle(tripTypeName);
            var titleElement = createTextElement(statisticsTitle);
            titleElement.style.color = tripTypes[tripTypeName].color;
            tripTypeElement.appendChild(titleElement);
            tripTypeElement.appendChild(createTextElement(': '));
            var elementId = tripTypeName + 'Count';
            tripTypeElement.appendChild(createElement('span', elementId, '--'));
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
            return {'bus': 'bussit', 'train': 'junat', 'tram': 'ratikat',
                    'metro': 'metrot', 'ferry': 'lautat',
                    'airplane': 'lentävät'}[tripTypeName];
        } else {
            return {'bus': 'buses', 'train': 'trains', 'tram': 'trams',
                    'metro': 'metros', 'ferry': 'ferries',
                    'airplane': 'airplanes'}[tripTypeName];
        }
    }

    function createTripTypeVisibilityElement(tripTypeName, tripType) {
        var visibilityElement = createElement('span');
        updateTripTypeVisibilityElement(visibilityElement, tripType.isVisible);
        visibilityElement.className = 'button';
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

    function createHideElement(onUiBarVisibilityChange) {
        var hideElement = createTextElement('(\u2199)');
        hideElement.className = 'button';
        hideElement.title = {'en': 'hide control bar', 'fi': 'piilota ohjainpalkki'}[state.lang];
        hideElement.addEventListener('click', function () {
            var showElement = createTextElement('(\u2197)');
            showElement.className = 'button visibilityButton';
            showElement.title = {'en': 'show control bar', 'fi': 'näytä ohjainpalkki'}[state.lang];
            showElement.addEventListener('click', function () {
                document.getElementById('ui_bar').style.visibility = 'visible';
                onUiBarVisibilityChange();
            });
            document.getElementById('ui_bar').style.visibility = 'hidden';
            onUiBarVisibilityChange(showElement);
        });
        return hideElement;
    }

    function createLanguageElement(selectedMap) {
        var languageElement = createElement('span');
        if (state.lang === 'fi') {
            languageElement.appendChild(createTextElement('Kieli: suomi / '));
            var linkElement = createElement('a', undefined, 'English');
            linkElement.href = getUrl(selectedMap, 'en');
            linkElement.title = 'show English version of this page';
            languageElement.appendChild(linkElement);
        } else {
            languageElement.appendChild(createTextElement('Language: '));
            var linkElement = createElement('a', undefined, 'suomi');
            linkElement.href = getUrl(selectedMap, 'fi');
            linkElement.title = 'näytä sivun suomenkielinen versio';
            languageElement.appendChild(linkElement);
            languageElement.appendChild(createTextElement(' / English'));
        }
        return languageElement;
    }

    function getUrl(selectedMap, lang) {
        var baseUrl = document.URL.split('/');
        baseUrl.pop();
        baseUrl = baseUrl.join('/');
        var prefix = {'Leaflet': 'index', 'Google': 'gmap'}[selectedMap];
        return baseUrl + '/' + prefix + '.' + lang + '.html';
    }

    function createJsonDataElement(dataSelection) {
        var jsonDataElement = createElement('span');
        jsonDataElement.appendChild(createTextElement('Data '));
        jsonDataElement.appendChild(createSelectionElement(dataSelection));
        jsonDataElement.appendChild(createTextElement(': '));
        jsonDataElement.appendChild(createElement('span', 'dataStatus'));
        return jsonDataElement;
    }

    function createMapSelectionElement(mapSelection) {
        var mapSelectionElement = createElement('span');
        var titleName = {'en': 'Map', 'fi': 'Kartta'}[state.lang];
        mapSelectionElement.appendChild(createTextElement(titleName + ': '));
        var selectElement = createSelectionElement(mapSelection);
        mapSelectionElement.appendChild(selectElement);
        return mapSelectionElement;
    }

    function createSelectionElement(selectionData) {
        var selectElement = createElement('select');
        for (var i = 0; i < selectionData.values.length; i++) {
            var optionElement = createElement('option');
            optionElement.text = selectionData.values[i];
            optionElement.selected = (selectionData.values[i] === selectionData.selectedValue);
            selectElement.add(optionElement);
        }
        selectElement.onchange = function (event) {
            selectionData.changeType(event.target.value);
        };
        return selectElement;
    }

    function createShareElement(getUrlParams, selectedMap) {
        var buttonName = {'en': 'share', 'fi': 'jaa'}[state.lang];
        var shareElement = createTextElement('(' + buttonName + ')');
        shareElement.className = 'button';
        shareElement.title =
            {'en': 'create link to this page', 'fi': 'tee linkki tähän näkymään'}[state.lang];
        shareElement.addEventListener('click', function () {
            var elementId = 'editShareLink';
            if (document.getElementById(elementId) === null) {
                createEditShareLinkElement(getUrlParams(), elementId, selectedMap);
            }
        });
        return shareElement;
    }

    function createEditShareLinkElement(urlParams, elementId, selectedMap) {
        var editShareLinkElement = createElement('div', elementId);
        editShareLinkElement.className = 'editShareLink';
        editShareLinkElement.appendChild(createCloseButtonElement());
        var linkElement = createElement('a');
        var itemElementIdPrefix = 'editShareLinkCheckBox';
        var tableElement =
            createShareLinkTableElement(urlParams, linkElement, itemElementIdPrefix, selectedMap);
        editShareLinkElement.appendChild(tableElement);
        editShareLinkElement.appendChild(linkElement);
        document.body.appendChild(editShareLinkElement);
        updateShareLinkUrl(linkElement, urlParams, itemElementIdPrefix, selectedMap);
        centerElement(editShareLinkElement);
    }

    function createCloseButtonElement() {
        var closeElement = createTextElement('(X)');
        closeElement.className = 'closeButton button';
        closeElement.title = {'en': 'close', 'fi': 'sulje'}[state.lang];
        closeElement.addEventListener('click', function () {
            document.body.removeChild(closeElement.parentNode);
        });
        return closeElement;
    }

    function createShareLinkTableElement(urlParams, linkElement, itemElementIdPrefix, selectedMap) {
        var tableElement = createElement('table');
        for (var i = 0; i < urlParams.length; i++) {
            var row = tableElement.insertRow(-1);
            var checkBoxElement =
                createElement('input', itemElementIdPrefix + urlParams[i]['name']);
            checkBoxElement.type = 'checkbox';
            checkBoxElement.checked = urlParams[i]['on'];
            checkBoxElement.addEventListener('click', function () {
                updateShareLinkUrl(linkElement, urlParams, itemElementIdPrefix, selectedMap);
            });
            row.appendChild(checkBoxElement);
            row.appendChild(createElement('td', undefined, urlParams[i]['name']));
            row.appendChild(createElement('td', undefined, urlParams[i]['value']));
        }
        return tableElement;
    }

    function updateShareLinkUrl(linkElement, urlParams, itemElementIdPrefix, selectedMap) {
        var pairs = [];
        for (var i = 0; i < urlParams.length; i++) {
            var elementId = itemElementIdPrefix + urlParams[i]['name'];
            var checkBoxElement = document.getElementById(elementId);
            if (checkBoxElement.checked) {
                pairs.push(urlParams[i]['name'] + '=' + urlParams[i]['value']);
            }
        }
        var fullUrl = getUrl(selectedMap, state.lang) + '?' + pairs.join('&');
        linkElement.href = fullUrl;
        linkElement.textContent = fullUrl;
    }

    function centerElement(elem) {
        elem.style.top = ((document.body.clientHeight - elem.clientHeight) / 2) + 'px';
        elem.style.left = ((document.body.clientWidth - elem.clientWidth) / 2) + 'px';
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

    this.setDataInfo = function (dtfsEpoch, jsonEpoch, sizeBytes, downloadDuration, isCompressed) {
        setElementText('dataStatus', 'OK');
        var infoElement = createElement('span', undefined, '*');
        infoElement.className = 'dataInfo';
        infoElement.title = getDataInfoTitle({'gtfsDate': epochToString(dtfsEpoch, false),
            'jsonDate': epochToString(jsonEpoch, true), 'size': getMegaBytes(sizeBytes),
            'duration': downloadDuration, 'compressed': isCompressed});
        document.getElementById('dataStatus').appendChild(infoElement);
    };

    function epochToString(epoch, isTimeIncluded) {
        return utils.dateToString(new Date(epoch * 1000), isTimeIncluded);
    }

    function getDataInfoTitle(dataInfo) {
        var titleItems = ['gtfsDate', 'jsonDate', 'size', 'duration', 'compressed'];
        var dataInfoTitle = '';
        for (var i = 0; i < titleItems.length; i++) {
            dataInfoTitle += getDataInfoItemName(titleItems[i]) + ': ' +
                getDataInfoItemValue(dataInfo[titleItems[i]]);
            if (i < (titleItems.length - 1)) {
                dataInfoTitle += '\n';
            }
        }
        return dataInfoTitle;
    }

    function getDataInfoItemName(dataInfoItem) {
        if (state.lang === 'fi') {
            return {'gtfsDate': 'GTFS', 'jsonDate': 'JSON', 'size': 'Koko (megatavua)',
                    'duration': 'Lataus (sekuntia)',
                    'compressed': 'Lataus (pakattu)'}[dataInfoItem];
        } else {
            return {'gtfsDate': 'GTFS', 'jsonDate': 'JSON', 'size': 'Size (megabytes)',
                    'duration': 'Download (seconds)',
                    'compressed': 'Download (compressed)'}[dataInfoItem];
        }
    }

    function getDataInfoItemValue(dataInfoItemValue) {
        if ((dataInfoItemValue === true) || (dataInfoItemValue === false)) {
            if (state.lang === 'fi') {
                return {true: 'kyllä', false: 'ei'}[dataInfoItemValue];
            } else {
                return {true: 'yes', false: 'no'}[dataInfoItemValue];
            }
        } else {
            return dataInfoItemValue;
        }
    }

    this.updateClock = function (date) {
        setElementText('clock', utils.dateToString(date, true));
    };

    this.updateStatistics = function () {
        var tripTypes = state.tripTypeInfos.getTypes();
        for (var tripTypeName in tripTypes) {
            if (tripTypes[tripTypeName].isUsed) {
                var elementId = tripTypeName + 'Count';
                setElementText(elementId, tripTypes[tripTypeName].count);
            }
        }
    };
}
