// jscs:disable validateQuoteMarks, disallowOperatorBeforeLineBreak
describe("Subsonic service -", function () {
    'use strict';

    var $q, mockBackend, subsonic, mockGlobals,
        response, url;
    beforeEach(function () {
        // We redefine it because in some tests we need to alter the settings
        mockGlobals = {
            settings: {
                AutoAlbumSize: 3,
                AutoPlaylistSize: 3,
                Username: "Hyzual",
                Password: "enc:cGFzc3dvcmQ=",
                Protocol: "jsonp",
                ApiVersion: "1.10.2",
                ApplicationName: "Jamstash",
                Timeout: 20000
            },
            // TODO: Hyz: Remove it when everything is refactored
            BaseURL: function () {
                return 'http://demo.subsonic.com/rest';
            }
        };

        module('jamstash.subsonic.service', function ($provide) {
            $provide.value('globals', mockGlobals);
            // Mock the model service
            $provide.decorator('map', function ($delegate) {
                $delegate.mapSong = function (argument) {
                    return argument;
                };
                $delegate.mapPodcast = function (argument) {
                    return argument;
                };
                $delegate.mapAlbum = function (argument) {
                    return argument;
                };
                return $delegate;
            });
            // Mock utils.getValue
            $provide.decorator('utils', function ($delegate) {
                $delegate.getValue = function () {
                    return undefined;
                };
                return $delegate;
            });
        });

        installPromiseMatchers();

        inject(function (_subsonic_, $httpBackend, _$q_) {
            subsonic = _subsonic_;
            mockBackend = $httpBackend;
            $q = _$q_;
        });
        response = { "subsonic-response": { status: "ok", version: "1.10.2" } };
    });

    afterEach(function () {
        mockBackend.verifyNoOutstandingExpectation();
        mockBackend.verifyNoOutstandingRequest();
    });

    describe("subsonicRequest() -", function () {
        var partialUrl;
        beforeEach(function () {
            partialUrl = '/getStarred.view';
            url = 'http://demo.subsonic.com/rest/getStarred.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
        });

        it("Given that the Subsonic server was not responding, when I make a request to Subsonic, then an error object with a message will be returned", function () {
            mockBackend.expectJSONP(url).respond(503, 'Service Unavailable');

            var promise = subsonic.subsonicRequest(partialUrl);
            mockBackend.flush();

            expect(promise).toBeRejectedWith({
                reason: 'Error when contacting the Subsonic server.',
                httpError: 503
            });
        });

        it("Given a missing parameter, when I make a request to Subsonic, then an error object with a message will be returned", function () {
            delete mockGlobals.settings.Password;
            var missingPasswordUrl = 'http://demo.subsonic.com/rest/getStarred.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp&u=Hyzual&v=1.10.2';
            var errorResponse = { 'subsonic-response' : {
                status : 'failed',
                version : '1.10.2',
                error : { code : 10, message : 'Required parameter is missing.' }
            } };
            mockBackend.expectJSONP(missingPasswordUrl).respond(JSON.stringify(errorResponse));

            var promise = subsonic.subsonicRequest(partialUrl);
            mockBackend.flush();

            expect(promise).toBeRejectedWith({
                reason: 'Error when contacting the Subsonic server.',
                subsonicError: { code: 10, message: 'Required parameter is missing.' },
                version: '1.10.2'
            });
        });

        it("Given that server and Jamstash had different api versions, when I make a request to Subsonic and the server responds an error, then it will return the server's api version in the error object", function () {
            var errorResponse = { 'subsonic-response': {
                status: 'failed',
                version: '1.8.0',
                error: { code: 30, message: 'Incompatible Subsonic REST protocol version. Server must upgrade.' }
            } };
            mockBackend.expectJSONP(url).respond(JSON.stringify(errorResponse));

            var promise = subsonic.subsonicRequest(partialUrl);
            mockBackend.flush();

            expect(promise).toBeRejectedWith({
                reason: 'Error when contacting the Subsonic server.',
                subsonicError: { code: 30, message: 'Incompatible Subsonic REST protocol version. Server must upgrade.' },
                version: '1.8.0'
            });
        });

        it("Given a partialUrl that did not start with '/', when I make a request to Subsonic, then a '/' will be added before the partial url", function () {
            partialUrl = 'getStarred.view';
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            subsonic.subsonicRequest(partialUrl);
            mockBackend.flush();
        });

        it("Given $http config params, when I make a request to Subsonic, then the params won't be overwritten", function () {
            partialUrl = 'scrobble.view';
            url = 'http://demo.subsonic.com/rest/scrobble.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp&id=75&p=enc:cGFzc3dvcmQ%3D&submission=false&u=Hyzual&v=1.10.2';
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            subsonic.subsonicRequest(partialUrl, {
                params: {
                    id: 75,
                    submission: false
                }
            });
            mockBackend.flush();
        });

        it("Given that the global protocol setting was 'json', when I make a request to Subsonic, then it will use GET and won't use the JSON_CALLBACK parameter", function () {
            mockGlobals.settings.Protocol = 'json';
            var getUrl = 'http://demo.subsonic.com/rest/getStarred.view?' +
                'c=Jamstash&f=json&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
            mockBackend.expectGET(getUrl).respond(JSON.stringify(response));

            var promise = subsonic.subsonicRequest(partialUrl);
            mockBackend.flush();

            expect(promise).toBeResolvedWith({ status: "ok", version: "1.10.2" });
        });
    });

    describe("getDirectory() -", function () {
        beforeEach(function () {
            url = 'http://demo.subsonic.com/rest/getMusicDirectory.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp' + '&id=209' + '&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
        });

        it("Given a directory containing 2 songs and 1 subdirectory and given its id, when I get the songs from that directory, then a promise will be resolved with an array of 2 songs and an array of 1 subdirectory", function () {
            response["subsonic-response"].directory = {
                child: [
                    { id: 778 },
                    { id: 614 },
                    { id: 205, isDir: true }
                ]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getDirectory(209);
            mockBackend.flush();

            expect(promise).toBeResolvedWith({
                directories: [{ id: 205, isDir: true }],
                songs: [{ id: 778 }, { id: 614 }]
            });
        });

        it("Given a directory containing 1 song in my Madsonic library and given its id, when I get the songs from that directory, then a promise will be resolved with an array of 1 song and an empty array of subdirectories", function () {
            response["subsonic-response"].directory = {
                child: { id: 402 }
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getDirectory(209);
            mockBackend.flush();

            expect(promise).toBeResolvedWith({
                directories: [],
                songs: [{ id: 402 }]
            });
        });

        it("Given a directory that didn't contain anything and given its id, when I get the songs from that directory, then a promise will be rejected with an error message", function () {
            response["subsonic-response"].directory = {};
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getDirectory(209);
            mockBackend.flush();

            expect(promise).toBeRejectedWith({ reason: 'This directory is empty.' });
        });
    });

    describe("recursiveGetDirectory() -", function () {
        var deferred;
        beforeEach(function () {
            deferred = $q.defer();
            spyOn(subsonic, 'getDirectory').and.returnValue(deferred.promise);
        });
        it("Given a directory containing 2 songs and a subdirectory itself containing 2 songs and given its id, when I get the songs from that directory, then a promise will be resolved with an array of 4 songs", function () {
            // Mock getDirectory so we are only testing the recursivity
            var firstDeferred = $q.defer();
            var secondDeferred = $q.defer();
            subsonic.getDirectory.and.callFake(function (id) {
                // First call to getDirectory
                if (id === 499) {
                    return firstDeferred.promise;
                // Second call to getDirectory
                } else if (id === 553) {
                    return secondDeferred.promise;
                }
            });

            var promise = subsonic.recursiveGetDirectory(499);
            // On the first call to getDirectory, we expect 2 songs and a subdirectory
            firstDeferred.resolve({
                directories: [{ id: 553, type: 'byfolder' }],
                songs: [
                    { id: 695 },
                    { id: 227 }
                ]
            });
            // On the second call, we expect 2 songs
            secondDeferred.resolve({
                directories: [],
                songs: [
                    { id: 422 },
                    { id: 171 }
                ]
            });

            expect(promise).toBeResolvedWith([
                { id: 695 },
                { id: 227 },
                { id: 422 },
                { id: 171 }
            ]);
        });

        it("Given a directory containing only 2 songs and given its id, when I get the songs from that directory, then a promise will be resolved with an array of 2 songs", function () {
            var promise = subsonic.recursiveGetDirectory(14);
            deferred.resolve({
                directories: [],
                songs: [
                    { id: 33 },
                    { id: 595 }
                ]
            });

            expect(promise).toBeResolvedWith([
                { id: 33 },
                { id: 595 }
            ]);
        });

        it("Given a directory that didn't contain anything and given its id, when I get the songs from that directory, then a promise will be resolved with an empty array", function () {
            var promise = subsonic.recursiveGetDirectory(710);
            deferred.reject({ reason: 'This directory is empty.' });

            expect(promise).toBeResolvedWith([]);
        });
    });

    describe("getAlbumListBy() -", function () {
        beforeEach(function () {
            url = 'http://demo.subsonic.com/rest/getAlbumList.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp' + '&offset=0' + '&p=enc:cGFzc3dvcmQ%3D' + '&size=3&type=newest' + '&u=Hyzual&v=1.10.2';
        });

        describe("Given that the global setting AutoAlbum Size was 3", function () {
            it("and given that there were more than 3 albums in my library, when I get the newest albums, then a promise will be resolved with an array of 3 albums", function () {
                response["subsonic-response"].albumList = {
                    album: [
                        { id: 124 },
                        { id: 731 },
                        { id: 319 }
                    ]
                };
                mockBackend.expectJSONP(url).respond(JSON.stringify(response));

                var promise = subsonic.getAlbumListBy('newest', 0);
                mockBackend.flush();

                expect(promise).toBeResolvedWith([
                    { id: 124 },
                    { id: 731 },
                    { id: 319 }
                ]);
            });

            it("and given there were 10 most played albums in my library, when I get the 3 first most played albums, then a promise will be resolved with an array of 3 albums", function () {
                url = 'http://demo.subsonic.com/rest/getAlbumList.view?' +
                    'c=Jamstash&callback=JSON_CALLBACK&f=jsonp' + '&offset=3' + '&p=enc:cGFzc3dvcmQ%3D' + '&size=3&type=frequent' + '&u=Hyzual&v=1.10.2';
                response["subsonic-response"].albumList = {
                    album: [
                        { id: 555 },
                        { id: 207 },
                        { id: 100 }
                    ]
                };
                mockBackend.expectJSONP(url).respond(JSON.stringify(response));

                var promise = subsonic.getAlbumListBy('frequent', 3);
                mockBackend.flush();

                expect(promise).toBeResolvedWith([
                    { id: 555 },
                    { id: 207 },
                    { id: 100 }
                ]);
            });

            it("and given there were albums in my library, when I get random albums with a negative offset, then the offset will be adjusted to 0", function () {
                url = 'http://demo.subsonic.com/rest/getAlbumList.view?' +
                    'c=Jamstash&callback=JSON_CALLBACK&f=jsonp' + '&offset=0' + '&p=enc:cGFzc3dvcmQ%3D' + '&size=3&type=random' + '&u=Hyzual&v=1.10.2';
                response["subsonic-response"].albumList = {
                    album: [
                        { id: 342 },
                        { id: 904 },
                        { id: 38 }
                    ]
                };
                mockBackend.expectJSONP(url).respond(JSON.stringify(response));

                subsonic.getAlbumListBy('random', -3);
                mockBackend.flush();
            });

            it("and given that there was only 1 album in my Madsonic library, when I get the newest albums, then a promise will be resolved with an array of 1 album", function () {
                response["subsonic-response"].albumList = {
                    album: { id: 29 }
                };
                mockBackend.expectJSONP(url).respond(JSON.stringify(response));

                var promise = subsonic.getAlbumListBy('newest');
                mockBackend.flush();

                expect(promise).toBeResolvedWith([
                    { id: 29 }
                ]);
            });

            it("and given that there were no albums in my library, when I get the newest albums, then a promise will be rejected with an error message", function () {
                response["subsonic-response"].albumList = {
                    album: []
                };
                mockBackend.expectJSONP(url).respond(JSON.stringify(response));

                var promise = subsonic.getAlbumListBy('newest');
                mockBackend.flush();

                expect(promise).toBeRejectedWith({ reason: 'No matching albums found on the Subsonic server.' });
            });
        });
    });

    describe("getStarred() -", function () {
        var url;
        beforeEach(function () {
            url = 'http://demo.subsonic.com/rest/getStarred.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
        });

        it("Given that I there were 2 starred albums, 1 starred artist and 3 starred songs in my library, when I get everything starred, then a promise will be resolved with an object containing an array of 2 albums, an array of 1 artist and an array of 3 songs", function () {
            response["subsonic-response"].starred = {
                artist: [{ id: 2245 }],
                album: [{ id: 1799 }, { id: 20987 }],
                song: [{ id: 2478 }, { id: 14726 }, { id: 742 }]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getStarred();
            mockBackend.flush();

            expect(promise).toBeResolvedWith({
                artist: [{ id: 2245 }],
                album: [{ id: 1799 }, { id: 20987 }],
                song: [{ id: 2478 }, { id: 14726 }, { id: 742 }]
            });
        });

        it("Given that there was absolutely nothing starred in my library, when I get everything starred, then a promise will be rejected with an error message", function () {
            response["subsonic-response"].starred = {};
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getStarred();
            mockBackend.flush();

            expect(promise).toBeRejectedWith({ reason: 'Nothing is starred on the Subsonic server.' });
        });
    });

    describe("getRandomStarredSongs() -", function () {
        beforeEach(function () {
            url = 'http://demo.subsonic.com/rest/getStarred.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
        });

        describe("Given that the global setting AutoPlaylist Size was 3", function () {
            it("and given that there were more than 3 starred songs in my library, when I get random starred songs, then a promise will be resolved with an array of 3 starred songs", function () {
                var library = [
                    { id: 11841 },
                    { id: 12061 },
                    { id: 17322 },
                    { id: 1547 },
                    { id: 14785 }
                ];
                response["subsonic-response"].starred = { song: library };
                mockBackend.expectJSONP(url).respond(JSON.stringify(response));

                var promise = subsonic.getRandomStarredSongs();
                // We create a spy in order to get the results of the promise
                var success = jasmine.createSpy("success");
                promise.then(success);

                mockBackend.flush();

                expect(promise).toBeResolved();
                expect(success).toHaveBeenCalled();
                var randomlyPickedSongs = success.calls.mostRecent().args[0];
                for (var i = 0; i < randomlyPickedSongs.length; i++) {
                    expect(library).toContain(randomlyPickedSongs[i]);
                }
            });

            it("and given that there was only 1 starred song in my library, when I get random starred songs, then a promise will be resolved with an array of 1 song", function () {
                response["subsonic-response"].starred = { song: [{ id: 11841 }]};
                mockBackend.expectJSONP(url).respond(JSON.stringify(response));

                var promise = subsonic.getRandomStarredSongs();
                mockBackend.flush();

                expect(promise).toBeResolvedWith([{ id: 11841 }]);
            });

            it("and given that there was only 1 starred song in my Madsonic library, when I get random starred songs, then a promise will be resolved with an array of 1 song", function () {
                response["subsonic-response"].starred = { song: { id: 5303 } };
                mockBackend.expectJSONP(url).respond(JSON.stringify(response));

                var promise = subsonic.getRandomStarredSongs();
                mockBackend.flush();

                expect(promise).toBeResolvedWith([{ id: 5303 }]);
            });

            it("and given there weren't any starred song in my library, when I get random starred songs, then a promise will be rejected with an error message", function () {
                response["subsonic-response"].starred = { song: []};
                mockBackend.expectJSONP(url).respond(JSON.stringify(response));

                var promise = subsonic.getRandomStarredSongs();
                mockBackend.flush();

                expect(promise).toBeRejectedWith({ reason: 'No starred songs found on the Subsonic server.' });
            });
        });
    });

    describe("getRandomSongs() -", function () {
        beforeEach(function () {
            url = 'http://demo.subsonic.com/rest/getRandomSongs.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp&p=enc:cGFzc3dvcmQ%3D' + '&size=3' + '&u=Hyzual&v=1.10.2';
        });

        describe("Given that the global setting AutoPlaylist Size was 3", function () {
            it("and given that there were more than 3 songs in my library, when I get random songs, then a promise will be resolved with an array of 3 songs", function () {
                var library = [
                    { id: 1143 },
                    { id: 5864 },
                    { id: 7407 },
                    { id: 6471 },
                    { id: 59 }
                ];
                response["subsonic-response"].randomSongs = { song: library };
                mockBackend.expectJSONP(url).respond(JSON.stringify(response));

                var promise = subsonic.getRandomSongs();
                // We create a spy in order to get the results of the promise
                var success = jasmine.createSpy("success");
                promise.then(success);

                mockBackend.flush();

                expect(promise).toBeResolved();
                expect(success).toHaveBeenCalled();
                var randomlyPickedSongs = success.calls.mostRecent().args[0];
                for (var i = 0; i < randomlyPickedSongs.length; i++) {
                    expect(library).toContain(randomlyPickedSongs[i]);
                }
            });

            it("and given that there was only 1 song in my library, when I get random songs, then a promise will be resolved with an array of 1 song", function () {
                response["subsonic-response"].randomSongs = { song: [{ id: 7793 }]};
                mockBackend.expectJSONP(url).respond(JSON.stringify(response));

                var promise = subsonic.getRandomSongs();
                mockBackend.flush();

                expect(promise).toBeResolvedWith([{ id: 7793 }]);
            });

            it("and given that there was only 1 song in my Madsonic library, when I get random songs, then a promise will be resolved with an array of 1 song", function () {
                response["subsonic-response"].randomSongs = { song: { id: 548 } };
                mockBackend.expectJSONP(url).respond(JSON.stringify(response));

                var promise = subsonic.getRandomSongs();
                mockBackend.flush();

                expect(promise).toBeResolvedWith([{ id: 548 }]);
            });

            it("and given that there wasn't any song in my library, when I get random songs, then a promise will be rejected with an error message", function () {
                response["subsonic-response"].randomSongs = { song: []};
                mockBackend.expectJSONP(url).respond(JSON.stringify(response));

                var promise = subsonic.getRandomSongs();
                mockBackend.flush();

                expect(promise).toBeRejectedWith({ reason: 'No songs found on the Subsonic server.' });
            });

            it("and given a genre, when I get random songs, then a promise will be resolved with an array of 3 songs from the given genre", function () {
                url = 'http://demo.subsonic.com/rest/getRandomSongs.view?' +
                    'c=Jamstash&callback=JSON_CALLBACK&f=jsonp' + '&genre=Rock' + '&p=enc:cGFzc3dvcmQ%3D' + '&size=3' + '&u=Hyzual&v=1.10.2';
                var library = [
                    { id: 9408 },
                    { id: 9470 },
                     { id: 6932 }
                ];
                response["subsonic-response"].randomSongs = { song: library };
                mockBackend.expectJSONP(url).respond(JSON.stringify(response));

                var promise = subsonic.getRandomSongs('Rock');
                mockBackend.flush();

                expect(promise).toBeResolvedWith([{ id: 9408 }, { id: 9470 }, { id: 6932 }]);
            });

            it("and given a folder id, when I get random songs, then a promise will be resolved with an array of 3 songs from the given folder", function () {
                url = 'http://demo.subsonic.com/rest/getRandomSongs.view?' +
                    'c=Jamstash&callback=JSON_CALLBACK&f=jsonp' + '&musicFolderId=2' + '&p=enc:cGFzc3dvcmQ%3D' + '&size=3' + '&u=Hyzual&v=1.10.2';
                var library = [
                    { id: 9232 },
                    { id: 3720 },
                    { id: 8139 }
                ];
                response["subsonic-response"].randomSongs = { song: library };
                mockBackend.expectJSONP(url).respond(JSON.stringify(response));

                var promise = subsonic.getRandomSongs('', 2);
                mockBackend.flush();

                expect(promise).toBeResolvedWith([{ id: 9232 }, { id: 3720 }, { id: 8139 }]);
            });
        });
    });

    it("ping() - when I ping Subsonic, then a promise will be resolved with Subsonic's response, containing its REST API version", function () {
        var url = 'http://demo.subsonic.com/rest/ping.view?' +
            'c=Jamstash&callback=JSON_CALLBACK&f=jsonp&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
        mockBackend.expectJSONP(url).respond(JSON.stringify(response));

        var promise = subsonic.ping();
        mockBackend.flush();

        expect(promise).toBeResolvedWith({ status: "ok", version: "1.10.2" });
    });

    it("scrobble() - Given a song, when I scrobble it, then a promise will be resolved with true if there was no error", function () {
        var song = { id: 45872 };
        var url = 'http://demo.subsonic.com/rest/scrobble.view?' +
            'c=Jamstash&callback=JSON_CALLBACK&f=jsonp' + '&id=45872' + '&p=enc:cGFzc3dvcmQ%3D' + '&submission=true' + '&u=Hyzual&v=1.10.2';
        mockBackend.expectJSONP(url).respond(JSON.stringify(response));

        var promise = subsonic.scrobble(song);
        mockBackend.flush();

        expect(promise).toBeResolvedWith(true);
    });

    describe("toggleStar() -", function () {
        it("Given an item (can be an artist, an album or a song) that wasn't starred, when I toggle its star, then a promise will be resolved with true", function () {
            var song = { id: 7748, starred: false };
            var url = 'http://demo.subsonic.com/rest/star.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp' + '&id=7748' + '&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.toggleStar(song);
            mockBackend.flush();

            expect(promise).toBeResolvedWith(true);
        });

        it("Given an item (can be an artist, an album or a song) that was starred, when I toggle its star, then a promise will be resolved with false", function () {
            var album = { id: 6631, starred: true };
            var url = 'http://demo.subsonic.com/rest/unstar.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp' + '&id=6631' + '&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.toggleStar(album);
            mockBackend.flush();

            expect(promise).toBeResolvedWith(false);
        });
    });

    describe("getMusicFolders() -", function () {
        beforeEach(function () {
            url = 'http://demo.subsonic.com/rest/getMusicFolders.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
        });

        it("Given that there were 2 music folders in my library, when I get the music folders, then a promise will be resolved with an array of 2 music folders", function () {
            response["subsonic-response"].musicFolders = {
                musicFolder: [
                    { id: 80, name: "languageless" },
                    { id: 38, name: "mala" }
                ]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getMusicFolders();
            mockBackend.flush();

            expect(promise).toBeResolvedWith([
                { id: 80, name: "languageless" },
                { id: 38, name: "mala" }
            ]);
        });

        it("Given that there was 1 music folder in my Madsonic library, when I get the music folders, then a promise will be resolved with an array of 1 music folder", function () {
            response["subsonic-response"].musicFolders = {
                musicFolder: { id: 56, name: "dite" }
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getMusicFolders();
            mockBackend.flush();

            expect(promise).toBeResolvedWith([
                { id: 56, name: "dite" }
            ]);
        });

        it("Given that there wasn't any music folder in my library, when I get the music folders, then a promise will be rejected with an error message", function () {
            response["subsonic-response"].musicFolders = {};
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getMusicFolders();
            mockBackend.flush();

            expect(promise).toBeRejectedWith({ reason: 'No music folder found on the Subsonic server.' });
        });
    });

    describe("getGenres() -", function () {
        beforeEach(function () {
            url = 'http://demo.subsonic.com/rest/getGenres.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
        });

        it("Given that there were 2 music genres, when I get the genres, then a promise will be resolved with an array of genres", function () {
            response["subsonic-response"].genres = {
                genre: [
                    {
                        value: "copunctal",
                        songCount: 33,
                        artistCount: 6,
                        albumCount: 8
                    }, {
                        value: "unsliding",
                        songCount: 67,
                        artistCount: 54,
                        albumCount: 41
                    }
                ]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getGenres();
            mockBackend.flush();

            expect(promise).toBeResolvedWith(["copunctal", "unsliding"]);
        });

        it("Given that there was only 1 genre in my Madsonic library, when I get the genres, then a promise will be resolved with an array of 1 genre", function () {
            response["subsonic-response"].genres = {
                genre: {
                    content: "periople",
                    songCount: 53,
                    artistCount: 7,
                    albumCount: 74
                }
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getGenres();
            mockBackend.flush();

            expect(promise).toBeResolvedWith(["periople"]);
        });

        it("Given that there wasn't any genre in my library, when I get the genres, then a promise will be rejected with an error message", function () {
            response["subsonic-response"].genres = [];
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getGenres();
            mockBackend.flush();

            expect(promise).toBeRejectedWith({ reason: 'No genre found on the Subsonic server.' });
        });
    });

    describe("getArtists() -", function () {
        beforeEach(function () {
            url = 'http://demo.subsonic.com/rest/getIndexes.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
        });

        it("Given that there were 2 artists at the top level, when I get the artists, then a promise will be resolved with an array of two artists", function () {
            response["subsonic-response"].indexes = {
                shortcut: [
                    { id: 8534, name: "Podcast" }
                ],
                index: [
                    {
                        name : "R",
                        artist: [
                            { id: 5493, name: "Ricki Perish" }
                        ]
                    },
                    {
                        name : "T",
                        artist: [
                            { id: 4934, name: "Terese Hoth" }
                        ]
                    }
                ]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getArtists();
            mockBackend.flush();

            expect(promise).toBeResolvedWith(response["subsonic-response"].indexes);
        });

        it("Given a folder id, when I get the artists, then it will be used as parameter in the request", function () {
            url = 'http://demo.subsonic.com/rest/getIndexes.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp' + '&musicFolderId=54' + '&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            subsonic.getArtists(54);
            mockBackend.flush();
        });

        it("Given that there were 2 artist at the top level of my Madsonic library, when I get the artists, then a promise will be resolved with an array of two artist", function () {
            response["subsonic-response"].indexes = {
                shortcut: { id: 433, name: "Podcast" },
                index: [
                    {
                        name: "B",
                        artist: { id: 748, name: "Berneice Trube" }
                    },
                    {
                        name: "J",
                        artist: { id: 742, name: "Jennine Parrack" }
                    }
                ]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getArtists();
            mockBackend.flush();

            expect(promise).toBeResolvedWith({
                shortcut: [
                    { id: 433, name: "Podcast" }
                ],
                index: [
                    {
                        name: "B",
                        artist: [
                            { id: 748, name: "Berneice Trube" }
                        ]
                    },
                    {
                        name: "J",
                        artist: [
                            { id: 742, name: "Jennine Parrack" }
                        ]
                    }
                ]
            });
        });

        it("When I get the artists of a given folder, then the correct url will be called", function () {
            var url = 'http://demo.subsonic.com/rest/getIndexes.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp' + '&musicFolderId=42' + '&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            subsonic.getArtists(42);
            mockBackend.flush();
        });

        it("Given that there weren't any artist or shortcut in my library (empty server), when I get the artists, then a promise will be rejected with an error message", function () {
            response["subsonic-response"].indexes = {};
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getArtists();
            mockBackend.flush();

            expect(promise).toBeRejectedWith({ reason: 'No artist found on the Subsonic server.' });
        });
    });

    describe("getPlaylists() -", function () {
        var url, myPlaylist, publicPlaylist;
        beforeEach(function () {
            url = 'http://demo.subsonic.com/rest/getPlaylists.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
            publicPlaylist = {
                id: "563",
                owner: "Rima Zentz"
            };
            myPlaylist = {
                id: "829",
                owner: "Hyzual"
            };
        });

        it("Given that there was 1 public playlist and 1 playlist that I own in my library, when I get the playlists, then a promise will be resolved with two arrays containing my playlist and the public playlist", function () {
            response["subsonic-response"].playlists = {
                playlist: [publicPlaylist, myPlaylist]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getPlaylists();
            mockBackend.flush();

            expect(promise).toBeResolvedWith({
                playlists: [myPlaylist],
                playlistsPublic: [publicPlaylist]
            });
        });

        it("Given that there was only 1 playlist in my library and that I own it, when I get the playlists, then a promise will be resolved with an array containing my playlist and an empty array for public playlists", function () {
            response["subsonic-response"].playlists = {
                playlist: [myPlaylist]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getPlaylists();
            mockBackend.flush();

            expect(promise).toBeResolvedWith({
                playlists: [myPlaylist],
                playlistsPublic: []
            });
        });

        it("Given that there was only 1 playlist in my Madsonic library and that I own it, when I get the playlists, then a promise will be resolved with an array containing my playlist and an empty array for public playlists", function () {
            response["subsonic-response"].playlists = {
                playlist: myPlaylist
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getPlaylists();
            mockBackend.flush();

            expect(promise).toBeResolvedWith({
                playlists: [myPlaylist],
                playlistsPublic: []
            });
        });

        it("Given that there was only 1 public playlist in my library and that I didn't own it, when I get the playlists, then a promise will be resolved with an empty array for my playlists and an array containing the public playlist", function () {
            response["subsonic-response"].playlists = {
                playlist: [publicPlaylist]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getPlaylists();
            mockBackend.flush();

            expect(promise).toBeResolvedWith({
                playlists: [],
                playlistsPublic: [publicPlaylist]
            });
        });

        it("Given that there wasn't any playlist in my library, when I get the playlists, then a promise will be rejected with an error message", function () {
            response["subsonic-response"].playlists = {};
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getPlaylists();
            mockBackend.flush();

            expect(promise).toBeRejectedWith({ reason: 'No playlist found on the Subsonic server.' });
        });
    });

    describe("getPlaylist() -", function () {
        beforeEach(function () {
            url = 'http://demo.subsonic.com/rest/getPlaylist.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp' + '&id=9123' + '&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
        });

        it("Given a playlist with 2 songs in it, when I get it, a promise will be resolved with an array containing those 2 songs", function () {
            response["subsonic-response"].playlist = {
                id: 9123,
                entry: [
                    { id: 2860 },
                    { id: 4762 }
                ]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getPlaylist(9123);
            mockBackend.flush();

            expect(promise).toBeResolvedWith([
                { id: 2860 },
                { id: 4762 }
            ]);
        });

        it("Given a playlist with only 1 song in it in my Madsonic library, when I get it, a promise will be resolved with an array containing that song", function () {
            response["subsonic-response"].playlist = {
                id: 886,
                entry: { id: 4699 }
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getPlaylist(9123);
            mockBackend.flush();

            expect(promise).toBeResolvedWith([
                { id: 4699 }
            ]);
        });

        it("Given an empty playlist (0 songs in it), when I get it, a promise will be rejected with an error message", function () {
            response["subsonic-response"].playlist = {};
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getPlaylist(9123);
            mockBackend.flush();

            expect(promise).toBeRejectedWith({ reason: 'This playlist is empty.' });
        });
    });

    it("addToPlaylist() - Given a playlist id and an array of songs, when I add those songs to the playlist, then an empty resolved promise will be returned", function () {
        var url = 'http://demo.subsonic.com/rest/updatePlaylist.view?' +
            'c=Jamstash&callback=JSON_CALLBACK&f=jsonp&p=enc:cGFzc3dvcmQ%3D' + '&playlistId=85' +
            '&songIdToAdd=644&songIdToAdd=275&songIdToAdd=383' +
            '&u=Hyzual&v=1.10.2';
        mockBackend.expectJSONP(url).respond(JSON.stringify(response));
        var songs = [
            { id: 644 },
            { id: 275 },
            { id: 383 }
        ];

        var promise = subsonic.addToPlaylist(85, songs);
        mockBackend.flush();

        expect(promise).toBeResolved();
    });

    it("newPlaylist() - Given a name, when I create a new playlist, an empty resolved promise will be returned", function () {
        var url = 'http://demo.subsonic.com/rest/createPlaylist.view?' +
            'c=Jamstash&callback=JSON_CALLBACK&f=jsonp' + '&name=Apolloship' + '&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
        mockBackend.expectJSONP(url).respond(JSON.stringify(response));

        var promise = subsonic.newPlaylist('Apolloship');
        mockBackend.flush();

        expect(promise).toBeResolved();
    });

    it("deletePlaylist() - Given a playlist id, when I delete that playlist, an empty resolved promise will be returned", function () {
        var url = 'http://demo.subsonic.com/rest/deletePlaylist.view?' +
            'c=Jamstash&callback=JSON_CALLBACK&f=jsonp' + '&id=7579' + '&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
        mockBackend.expectJSONP(url).respond(JSON.stringify(response));

        var promise = subsonic.deletePlaylist(7579);
        mockBackend.flush();

        expect(promise).toBeResolved();
    });

    it("savePlaylist() - Given an array of songs and a playlist id, when I save that playlist, an empty resolved promise will be returned", function () {
        var url = 'http://demo.subsonic.com/rest/createPlaylist.view?' +
            'c=Jamstash&callback=JSON_CALLBACK&f=jsonp&p=enc:cGFzc3dvcmQ%3D' + '&playlistId=7071' +
            '&songId=2801&songId=1002&songId=6612' +
            '&u=Hyzual&v=1.10.2';
        mockBackend.expectJSONP(url).respond(JSON.stringify(response));

        var songs = [
            { id: 2801 },
            { id: 1002 },
            { id: 6612 }
        ];
        var promise = subsonic.savePlaylist(7071, songs);
        mockBackend.flush();

        expect(promise).toBeResolved();
    });

    describe("getPodcasts() -", function () {
        beforeEach(function () {
            url = 'http://demo.subsonic.com/rest/getPodcasts.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp' + '&includeEpisodes=false' + '&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
        });

        it("Given that there were podcasts in my library, when I load the podcasts, then a promise will be resolved with an array of podcasts", function () {
            response["subsonic-response"].podcasts = {
                channel: [
                    { id: 7820 },
                    { id: 5174 },
                    { id: 2404 }
                ]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getPodcasts();
            mockBackend.flush();

            expect(promise).toBeResolvedWith([
                { id: 7820 },
                { id: 5174 },
                { id: 2404 }
            ]);
        });

        it("Given that there was one podcast in my Madsonic library, when I load the podcasts, then a promise will be resolved with an array of one podcast", function () {
            response["subsonic-response"].podcasts = {
                channel: { id: 46 }
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getPodcasts();
            mockBackend.flush();

            expect(promise).toBeResolvedWith([
                { id: 46 }
            ]);
        });

        it("Given that there weren't any podcast in the library, when I load the podcasts, then a promise will be rejected with an error message", function () {
            response["subsonic-response"].podcasts = {};
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getPodcasts();
            mockBackend.flush();

            expect(promise).toBeRejectedWith({ reason: 'No podcast found on the Subsonic server.' });
        });
    });

    describe("getPodcast() -", function () {
        beforeEach(function () {
            url = 'http://demo.subsonic.com/rest/getPodcasts.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp' + '&id=2695&includeEpisodes=true' + '&p=enc:cGFzc3dvcmQ%3D&u=Hyzual&v=1.10.2';
        });

        it("Given a podcast id, when I load that podcast, then a promise will be resolved with an array of songs from all the non-skipped episodes of that podcast", function () {
            response["subsonic-response"].podcasts = {
                channel: [
                    {
                        id: 2695,
                        episode: [
                            {
                                id: 691,
                                status: "completed"
                            }, {
                                id: 771,
                                status: "skipped"
                            }, {
                                id: 227,
                                status: "completed"
                            }
                        ]
                    }
                ]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getPodcast(2695);
            mockBackend.flush();

            expect(promise).toBeResolvedWith([
                {
                    id: 691,
                    status: "completed"
                }, {
                    id: 227,
                    status: "completed"
                }
            ]);
        });

        it("Given that I had a single podcast in my Madsonic library that only had 1 non-skipped episode, when I get that podcast, then a promise will be resolved with an array of one song", function () {
            response["subsonic-response"].podcasts = {
                channel: {
                    id: 2695,
                    episode: {
                        id: 5782,
                        status: "completed"
                    }
                }
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getPodcast(2695);
            mockBackend.flush();

            expect(promise).toBeResolvedWith([
                { id: 5782, status: "completed" }
            ]);
        });

        it("Given that the podcast I wanted to get didn't exist in the library, when I load that podcast, then a promise will be rejected with an error message", function () {
            response["subsonic-response"].podcasts = {};
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getPodcast(2695);
            mockBackend.flush();

            expect(promise).toBeRejectedWith({ reason: 'This podcast was not found on the Subsonic server.' });
        });

        it("Given that the podcast I wanted to get was empty (0 non-skipped episode in it), when I load that podcast, then a promise will be rejected with an error message", function () {
            response["subsonic-response"].podcasts = {
                channel: [
                    {
                        id: 2695,
                        episode: [
                            {
                                id: 678,
                                status: "skipped"
                            },
                            {
                                id: 972,
                                status: "skipped"
                            }
                        ]
                    }
                ]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.getPodcast(2695);
            mockBackend.flush();

            expect(promise).toBeRejectedWith({ reason: 'No downloaded episode found for this podcast. Please check the podcast settings.' });
        });
    });

    describe("search() -", function () {
        beforeEach(function () {
            url = 'http://demo.subsonic.com/rest/search2.view?' +
                'c=Jamstash&callback=JSON_CALLBACK&f=jsonp&p=enc:cGFzc3dvcmQ%3D' + '&query=unintersetingly' + '&u=Hyzual&v=1.10.2';
        });

        it("Given that songs containing 'unintersetingly' existed in my library, when I search for a song that contains 'unintersetingly', then a promise will be resolved with an array of songs", function () {
            response["subsonic-response"].searchResult2 = {
                song: [
                    {
                        id: 2916,
                        name: "unintersetingly sleepyhead"
                    }, {
                        id: 489,
                        name: "unintersetingly Labyrinthula"
                    }
                ]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.search("unintersetingly", 0);
            mockBackend.flush();

            expect(promise).toBeResolvedWith([
                {
                    id: 2916,
                    name: "unintersetingly sleepyhead"
                }, {
                    id: 489,
                    name: "unintersetingly Labyrinthula"
                }
            ]);
        });

        it("Given that songs containing 'unintersetingly' existed in my Music Cabinet library, when I search for a song that contains 'unintersetingly', then a promise will be resolved with an array of songs", function () {
            response["subsonic-response"].search2 = {
                song: [
                    {
                        id: 7907,
                        name: "unintersetingly Caragana"
                    }, {
                        id: 4089,
                        name: "attacolite unintersetingly"
                    }
                ]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.search("unintersetingly", 0);
            mockBackend.flush();

            expect(promise).toBeResolvedWith([
                {
                    id: 7907,
                    name: "unintersetingly Caragana"
                }, {
                    id: 4089,
                    name: "attacolite unintersetingly"
                }
            ]);
        });

        it("Given that only one song containing 'unintersetingly' existed in my Madsonic library, when I search for a song that contains 'unintersetingly', then a promise will be resolved with an array of one song", function () {
            response["subsonic-response"].searchResult2 = {
                song: { id: 142, name: "unintersetingly rescue" }
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.search("unintersetingly", 0);
            mockBackend.flush();

            expect(promise).toBeResolvedWith([
                { id: 142, name: "unintersetingly rescue" }
            ]);
        });

        it("Given that no songs containing 'unintersetingly' existed in my library, when I search for a song that contains 'unintersetingly', then a promise will be rejected with an error message", function () {
            response["subsonic-response"].searchResult2 = {
                album: []
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.search("unintersetingly", 0);
            mockBackend.flush();

            expect(promise).toBeRejectedWith({ reason: "No results." });
        });

        it("Given that albums containing 'unintersetingly' existed in my library, when I search for an album that contains 'unintersetingly', then a promise will be resolved with an array of albums", function () {
            response["subsonic-response"].searchResult2 = {
                album: [
                    {
                        id: 434,
                        name: "Microtomical unintersetingly"
                    }, {
                        id: 150,
                        name: "unintersetingly assurance"
                    }
                ]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.search("unintersetingly", 1);
            mockBackend.flush();

            expect(promise).toBeResolvedWith([
                {
                    id: 434,
                    name: "Microtomical unintersetingly"
                }, {
                    id: 150,
                    name: "unintersetingly assurance"
                }
            ]);
        });

        it("Given that only one album containing 'unintersetingly' existed in my Madsonic library, when I search for an album that contains 'unintersetingly', then a promise will be resolved with an array of one album", function () {
            response["subsonic-response"].searchResult2 = {
                album: { id: 880, name: "Tortoiselike unintersetingly" }
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.search("unintersetingly", 1);
            mockBackend.flush();

            expect(promise).toBeResolvedWith([
                { id: 880, name: "Tortoiselike unintersetingly" }
            ]);
        });

        it("Given that no albums containing 'unintersetingly' existed in my library, when I search for an album that contains 'unintersetingly', then a promise will be rejected with an error message", function () {
            response["subsonic-response"].searchResult2 = {
                song: []
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.search("unintersetingly", 1);
            mockBackend.flush();

            expect(promise).toBeRejectedWith({ reason: "No results." });
        });

        it("Given that artists containing 'unintersetingly' existed in my library, when I search for an artist that contains 'unintersetingly', then a promise will be resolved with an array of artists", function () {
            response["subsonic-response"].searchResult2 = {
                artist: [
                    {
                        id: 52,
                        name: "unintersetingly overlaxly"
                    }, {
                        id: 77,
                        name: "Waybread unintersetingly"
                    }
                ]
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.search("unintersetingly", 2);
            mockBackend.flush();

            expect(promise).toBeResolvedWith([
                {
                    id: 52,
                    name: "unintersetingly overlaxly"
                }, {
                    id: 77,
                    name: "Waybread unintersetingly"
                }
            ]);
        });

        it("Given that only one artist containing 'unintersetingly' existed in my Madsonic library, when I search for an artist that contains 'unintersetingly', then a promise will be resolved with an array of one artist", function () {
            response["subsonic-response"].searchResult2 = {
                artist: { id: 99, name: "unintersetingly Vishnavite" }
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.search("unintersetingly", 2);
            mockBackend.flush();

            expect(promise).toBeResolvedWith([
                { id: 99, name: "unintersetingly Vishnavite" }
            ]);
        });

        it("Given that no artists containing 'unintersetingly' existed in my library, when I search for an artist that contains 'unintersetingly', then a promise will be rejected with an error message", function () {
            response["subsonic-response"].searchResult2 = {
                song: []
            };
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.search("unintersetingly", 2);
            mockBackend.flush();

            expect(promise).toBeRejectedWith({ reason: "No results." });
        });

        it("Given that there wasn't anything in the library containing 'unintersetingly', when I search for anything that contains 'unintersetingly', then a promise will be rejected with an error message", function () {
            response["subsonic-response"].searchResult2 = {};
            mockBackend.expectJSONP(url).respond(JSON.stringify(response));

            var promise = subsonic.search("unintersetingly", 0);
            mockBackend.flush();

            expect(promise).toBeRejectedWith({ reason: "No results." });
        });

        it("Given a search type that isn't 0 or 1 or 2, when I search for anything, Subsonic's API won't be called and a promise will be rejected with an error message", function () {
            var promise = subsonic.search("fading", 35);

            expect(promise).toBeRejectedWith({ reason: "Wrong search type." });
        });
    });
});
