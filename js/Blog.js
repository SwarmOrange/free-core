class Blog {
    constructor(swarm, ensUtility) {
        this.ensUtility = ensUtility;
        this.last_photoalbum_id = 0;
        this.last_videoalbum_id = 0;
        this.prefix = "social/";
        this.mruName = "SWARM Social";
        this.swarm = swarm;
        this.version = 1;
        this.myProfile = {};
        let elements = [];
        if (typeof window !== 'undefined') {
            elements = window.location.href.split('/').filter(word => word.length === 64 || word.length === 128 || (word.length >= 11 && word.endsWith('.eth')));
        }

        this.uploadedToSwarm = elements.length > 0;
        if (this.uploadedToSwarm) {
            this.uploadedSwarmHash = elements[0];
        } else {
            this.uploadedSwarmHash = '';
        }
    }

    getSwarmHashByWallet(walletAddress) {
        const self = this;
        return new Promise((resolve, reject) => {
            self.ensUtility.contract.getHash.call(walletAddress, function (error, result) {
                console.log([error, result]);
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });
    }

    getDefaultProfile() {
        return {
            "first_name": "SWARM",
            "last_name": "User",
            "birth_date": "24/07/2018",
            "location": {
                "coordinates": {},
                "name": "Belarus, Minsk"
            },
            "photo": {
                "original": "social/file/avatar/original.jpg"
            },
            "about": "My SWARM page. You can edit this information",
            "i_follow": [],
            "last_post_id": 0,
            "last_photoalbum_id": 0,
            "last_videoalbum_id": 0
        };
    }

    deleteFile(file) {
        return this.swarm.delete(file);
    }

    replaceUrlSwarmHash(newHash) {
        if (this.uploadedToSwarm) {
            window.location.hash = '';
        }

        let newElements = [];
        window.location.href.split('/').forEach(function (v) {
            let item = v;
            if (Blog.isCorrectSwarmHash(v)) {
                item = newHash;
            }

            newElements.push(item);
        });
        let newUrl = newElements.join('/');
        window.history.pushState({"swarmHash": newHash}, "", newUrl);

        return newUrl;
    }

    static isCorrectSwarmHash(hash) {
        let hashLength = 64;
        let hashLengthEncrypted = 128;

        return hash && (hash.length === hashLength || hash.length === hashLengthEncrypted);
    }

    getMyProfile() {
        return this.getProfile(this.swarm.applicationHash);
    }

    setMyProfile(data) {
        this.myProfile = data;
    }

    saveProfile(data, userHash) {
        data.version = this.version;
        return this.swarm.post(this.prefix + "profile.json", JSON.stringify(data), 'application/json', userHash);
    }

    getProfile(userHash) {
        return this.swarm.get(this.prefix + 'profile.json', userHash);
    }

    getIFollow() {
        return this.myProfile.i_follow ? this.myProfile.i_follow.slice(0) : [];
    }

    addIFollow(swarmProfileHash, userHash) {
        swarmProfileHash = swarmProfileHash.toLowerCase();
        if ('i_follow' in this.myProfile) {
            if (this.myProfile.i_follow.indexOf(swarmProfileHash) > -1) {
                throw "Hash already exists";
            }

            this.myProfile.i_follow.push(swarmProfileHash);
        } else {
            this.myProfile.i_follow = [swarmProfileHash];
        }

        return this.saveProfile(this.myProfile, userHash);
    }

    deleteIFollow(swarmProfileHash, userHash) {
        swarmProfileHash = swarmProfileHash.toLowerCase();
        if ('i_follow' in this.myProfile) {
            if (this.myProfile.i_follow.indexOf(swarmProfileHash) > -1) {
                let index = this.myProfile.i_follow.indexOf(swarmProfileHash);
                if (index > -1) {
                    this.myProfile.i_follow.splice(index, 1);
                }
            }
        } else {
            this.myProfile.i_follow = [];
        }

        return this.saveProfile(this.myProfile, userHash);
    }

    sendRawFile(fileName, data, fileType, userHash, swarmProtocol, onProgress) {
        return this.swarm.post(fileName, data, fileType, userHash, swarmProtocol, onProgress);
    }

    uploadFilesForPost(id, filesFormData, onUploadProgress) {
        const contentType = 'multipart/form-data';
        const self = this;
        const url = this.prefix + "post/" + id + "/file/";

        return this.sendRawFile(url, filesFormData, contentType, null, null, onUploadProgress)
            .then(function (response) {
                    return {
                        response: response,
                        url: url,
                        fullUrl: self.swarm.getFullUrl(url, response.data)
                    };
                }
            );
    }

    uploadAvatar(fileContent) {
        const self = this;
        const url = this.prefix + "file/avatar/original.jpg";

        return this.sendRawFile(url, fileContent, 'image/jpeg')
            .then(function (response) {
                console.log('avatar uploaded');
                console.log(response.data);
                self.swarm.applicationHash = response.data;
                self.myProfile.photo = {
                    original: url
                };

                return self.saveProfile(self.myProfile);
            });
    }

    createPost(id, description, attachments) {
        const self = this;
        attachments = attachments || [];
        attachments.forEach(function (v, i) {
            v.id = i + 1;
        });
        let info = {
            id: id,
            description: description,
            attachments: attachments
        };

        return this.sendRawFile(this.prefix + "post/" + id + "/info.json", JSON.stringify(info), 'application/json')
            .then(function (response) {
                console.log('one');
                console.log(response.data);
                self.myProfile.last_post_id = id;
                self.swarm.applicationHash = response.data;

                return self.saveProfile(self.myProfile);
            });
    }

    getPost(id, userHash) {
        return this.swarm.get(this.prefix + 'post/' + id + '/info.json', userHash);
    }

    deletePost(id) {
        const self = this;
        let urlPath = this.prefix + 'post/' + id + '/';
        return this.deleteFile(urlPath + 'info.json')
            .then(function (response) {
                self.swarm.applicationHash = response.data;
                return self.deleteFile(urlPath);
            });
    }

    deletePostAttachment(postId, attachmentId) {
        const self = this;
        return self.getPost(postId).then(function (response) {
            let data = response.data;
            let newAttachments = [];
            let toDelete = null;
            data.attachments.forEach(function (v) {
                if (v.id != attachmentId) {
                    newAttachments.push(v);
                } else {
                    toDelete = v;
                }
            });

            if (toDelete) {
                return self.editPost(postId, data.description, newAttachments)
                    .then(function (response) {
                        self.swarm.applicationHash = response.data;

                        return self.deleteFile(toDelete.url);
                    });
            } else {
                throw "Attachment not found";
            }
        });
    }

    editPost(id, description, attachments) {
        const self = this;
        return this.getPost(id)
            .then(function (response) {
                let data = response.data;
                attachments = attachments || data.attachments;
                data.description = description;
                data.attachments = attachments;
                return self.swarm.post(self.prefix + "post/" + id + "/info.json", JSON.stringify(data), 'application/json');
            });
    }

    createVideoAlbum(id, name, description, videos, coverOverride) {
        const self = this;
        let coverFile;

        videos = videos || [];

        if (coverOverride) {
            coverFile = this.prefix + "videoalbum/" + id + "/" + coverOverride;
        } else {
            coverFile = videos.length ? videos[0].cover_file : videos;
        }

        let fileType = videos.length ? videos[0].type : videos;
        let info = {
            id: id,
            type: fileType,
            name: name,
            description: description,
            cover_file: coverFile,
            videos: videos
        };

        let finalSave = function (data) {
            return this.saveVideoAlbumsInfo( data )
                .then(function (response) {
                    console.log(response.data);
                    self.swarm.applicationHash = response.data;
                    self.myProfile.last_videoalbum_id = id;

                    return {response: self.saveProfile(self.myProfile), info: info, hash: response.data};
                });
        };

        return this.sendRawFile(this.prefix + "videoalbum/" + id + "/info.json", JSON.stringify(info), 'application/json')
            .then(function (response) {
                console.log('Video album info.json');
                console.log(response.data);
                self.swarm.applicationHash = response.data;
                let newInfo = {
                    id: id,
                    type: fileType,
                    name: name,
                    description: description,
                    cover_file: coverFile
                };

                return self.getVideoAlbumsInfo()
                    .then(function (response) {
                        let data = response.data;
                        data = Array.isArray(data) ? data : [];

                        data.push(newInfo);
                        console.log('album info');
                        console.log(data);

                        return finalSave(data);
                    })
                    .catch(function () {
                        return finalSave([newInfo]);
                    });
            });
    }

    getVideoAlbumsInfo() {
        return this.swarm.get(this.prefix + 'videoalbum/info.json');
    }

    getVideoAlbumInfo(id) {
        return this.swarm.get(this.prefix + 'videoalbum/' + id + '/info.json');
    }

    saveVideoAlbumInfo(id, info) {
        return this.sendRawFile(this.prefix + "videoalbum/" + id + "/info.json", JSON.stringify(info), 'application/json');
    }

    saveVideoAlbumsInfo(data) {
        return this.sendRawFile(this.prefix + "videoalbum/info.json", JSON.stringify(data), 'application/json');
    }

    getLatestAlbumId() {
        return this.getVideoAlbumsInfo()
        .then( function(response) {
            const ids = response.data.map( album => album.id );

            return { albumId: ids.pop() || 0 }
        } )
        // @TODO: The catch should not be necessary, would simplifiy things if the root videoAlbums file was already created.
        .catch( err => {
            const { message } = err;
            const fileIsNotAvailable = ["404", "Network Error"].some( error => message.includes( error ) )
            const self = this;

            if ( fileIsNotAvailable ) {
                return this.saveVideoAlbumsInfo([])
                .then(function (response) {
                    const hash = response.data;
                    self.swarm.applicationHash = hash;
                    self.myProfile.last_videoalbum_id = 1;

                    return {albumId: 0, hash: hash};
                });
            }
        });
    }

    /*
        Concern:
        If many services are trying to upload to the same albumId, they may generate the same new videoId before they are uploaded.
    */
    generateVideoEntry(albumId, name, description, cover_file, file, type) {
        const self = this;

        return this.getVideoAlbumInfo(albumId).then(function (response) {
            const albumInfo = response.data;
            const videos = albumInfo.videos;
            const hasNoVideos = !videos || videos.length == 0;
            const id = hasNoVideos ? 1 : videos.length + 1;

            return {
                id: id,
                name: name,
                description: description,
                cover_file: self.prefix + "videoalbum/" + albumId + "/" + cover_file,
                file: self.prefix + "videoalbum/" + albumId + "/" + file,
                type: type
            };
        });
    }

    appendVideoEntry(albumId, fileInfo) {
        const self = this;

        return this.getVideoAlbumInfo(albumId)
            .then(function(response) {
                let data = response.data;

                if (data.videos) {
                    data.videos.push(fileInfo);
                } else {
                    data.videos = [fileInfo];
                }

                return self.saveVideoAlbumInfo(albumId, data);
            })
            .then(function (response) {
                return {
                    response: response.data
                };
            });
    }

    // I cannot use the browser API for new File(), and thus have to pass the data differently. We could perhaps also the existing function, but this edit gets me going for now and can open discussion.
    uploadFileToVideoAlbumNodeJs(albumId, file, onProgress, data) {
        const fileName = this.prefix + "videoalbum/" + albumId + "/" + file.name;

        return this.sendRawFile(fileName, file.data, file.type, null, null, onProgress)
            .then(function (response) {

                return {fileName: fileName, response: response.data};
            });
    }

    uploadFileToVideoalbum(albumId, file, onProgress, fileInfo) {
        const self = this;
        let fileName = this.prefix + "videoalbum/" + albumId + "/" + file.name;

        return this.sendRawFile(fileName, file, file.type, null, null, onProgress)
            .then(function (response) {
                if (fileInfo) {
                    return self.getAlbumInfo(albumId)
                        .then(function (response) {
                            let data = response.data;
                            if (data.videos) {
                                data.videos.push(fileInfo);
                            } else {
                                data.videos = [
                                    fileInfo
                                ];
                            }

                            return self.saveVideoAlbumInfo(albumId, data);
                        })
                        .then(function (response) {
                            return {
                                fileName: fileName,
                                response: response.data
                            };
                        });
                } else {
                    return {
                        fileName: fileName,
                        response: response.data
                    };
                }
            });
    }

    createPhotoAlbum(id, name, description, photos) {
        const self = this;
        photos = photos || [];
        let coverFile = photos.length ? photos[0] : photos;
        let info = {
            id: id,
            name: name,
            description: description,
            cover_file: coverFile,
            photos: photos
        };

        let navigateAndSaveProfile = function (response) {
            self.swarm.applicationHash = response.data;
            self.myProfile.last_photoalbum_id = id;

            return self.saveProfile(self.myProfile);
        };

        return this.sendRawFile(this.prefix + "photoalbum/" + id + "/info.json", JSON.stringify(info), 'application/json')
            .then(function (response) {
                console.log('Photoalbom info.json');
                console.log(response.data);
                self.swarm.applicationHash = response.data;
                let newAlbumInfo = {
                    id: id,
                    name: name,
                    description: description,
                    cover_file: coverFile
                };

                return self.getPhotoAlbumsInfo()
                    .then(function (response) {
                        let data = response.data;
                        data = Array.isArray(data) ? data : [];
                        data.push(newAlbumInfo);
                        console.log('album info');
                        console.log(data);
                        return self.savePhotoAlbumsInfo(data).then(function (response) {
                            return navigateAndSaveProfile(response);
                        });
                    })
                    .catch(function () {
                        return self.savePhotoAlbumsInfo([newAlbumInfo]).then(function (response) {
                            return navigateAndSaveProfile(response);
                        });
                    });
            });
    }

    uploadPhotoToAlbum(photoAlbumId, photoId, fileContent, onProgress) {
        let path = this.prefix + "photoalbum/" + photoAlbumId + "/";
        let fileName = path + photoId + ".jpg";
        return this.sendRawFile(fileName, fileContent, 'image/jpeg', null, null, onProgress)
            .then(function (response) {
                return {
                    path: path,
                    fileName: fileName,
                    response: response.data
                };
            });
    }

    getAlbumInfo(id) {
        return this.swarm.get(this.prefix + 'photoalbum/' + id + '/info.json');
    }

    getPhotoAlbumsInfo() {
        return this.swarm.get(this.prefix + 'photoalbum/info.json');
    }

    savePhotoAlbumsInfo(data) {
        return this.sendRawFile(this.prefix + "photoalbum/info.json", JSON.stringify(data), 'application/json');
    }

    deletePhotoAlbum(id) {
        const self = this;
        return this.swarm.delete(this.prefix + 'photoalbum/' + id + '/')
            .then(function (response) {
                self.swarm.applicationHash = response.data;
            })
            .then(function () {
                return self.getPhotoAlbumsInfo();
            })
            .then(function (response) {
                let data = response.data;
                let newAlbums = [];
                if (data && Array.isArray(data) && data.length) {
                    data.forEach(function (v) {
                        if (v.id != id) {
                            newAlbums.push(v);
                        }
                    });
                }

                return self.savePhotoAlbumsInfo(newAlbums);
            });
    }

    createMru(ownerAddress) {
        const self = this;
        // todo save it to profile
        if (!ownerAddress) {
            throw "Empty owner address";
        }

        let timestamp = +new Date();
        let data = {
            "name": this.mruName,
            "frequency": 5,
            "startTime": timestamp,
            "ownerAddr": ownerAddress
        };

        return this.swarm.post(null, data, null, null, 'bzz-resource:')
            .then(function (response) {
                self.myProfile.mru = response.data;
                return {
                    mru: response.data,
                    response: self.saveProfile(self.myProfile)
                };
            });
    }

    saveMru(mru, rootAddress, swarmHash) {
        if (mru && rootAddress && swarmHash) {
        } else {
            throw "Empty MRU, rootAddress or SWARM hash";
        }

        let timestamp = +new Date();
        let data = {
            "name": this.mruName,
            "frequency": 5,
            "startTime": timestamp,
            "rootAddr": rootAddress,
            "data": "0x12a3",
            "multiHash": false,
            "version": 1,
            "period": 1,
            "signature": "0x71c54e53095466d019f9f46e34ae0b393d04a5dac7990ce65934a3944c1f39badfc8c4f3c78baaae8b2e86cd21940914c57a4dff5de45d47e35811f983991b7809"
        };

        return this.swarm.post(null, data, null, null, 'bzz-resource:');
    }

    saveMessage(receiverHash, message, afterReceiverMessage, afterMessageId, timestamp, isPrivate) {
        receiverHash = receiverHash.toLowerCase();
        const self = this;
        timestamp = timestamp || +new Date();
        if (isPrivate) {
            throw('Private messages not supported');
        }

        /*if (!Blog.isCorrectSwarmHash(receiverHash)) {
            throw('Incorrect receiver hash');
        }*/

        if (!message) {
            throw('Empty message');
        }


        let sendMessage = function (messageInfo) {
            let messageId = 1;
            if (receiverHash in messageInfo && 'last_message_id' in messageInfo[receiverHash]) {
                messageInfo[receiverHash].last_message_id++;
                messageId = messageInfo[receiverHash].last_message_id;
            } else {
                messageInfo = messageInfo || {};
                messageInfo[receiverHash] = {last_message_id: messageId};
            }

            let data = {
                id: messageId,
                timestamp: timestamp,
                after_receiver_message: afterReceiverMessage,
                after_message_id: afterMessageId,
                receiver_hash: receiverHash,
                message: message
            };

            return self.swarm.post(self.prefix + "message/public/" + receiverHash + "/" + messageId + ".json", JSON.stringify(data), 'application/json').then(function (response) {
                self.swarm.applicationHash = response.data;
                return self.saveMessageInfo(messageInfo);
            });
        };

        return self.getMessageInfo()
            .then(function (response) {
                return sendMessage(response.data);
            })
            .catch(function () {
                return sendMessage({});
            });
    }

    getMessage(id, receiverHash, userHash) {
        return this.swarm.get(this.prefix + 'message/public/' + receiverHash + '/' + id + '.json', userHash);
    }

    getMessageInfo(userHash) {
        const self = this;
        return this.swarm.get(this.prefix + 'message/public/info.json', userHash)
            .then(function (response) {
                if (response.data) {
                    response.data = self.objectKeysToLowerCase(response.data);
                }

                return response;
            });
    }

    saveMessageInfo(data) {
        return this.swarm.post(this.prefix + 'message/public/info.json', JSON.stringify(data));
    }

    objectKeysToLowerCase(input, deep, filter) {
        var idx, key, keys, last, output, self, type, value;
        self = this.objectKeysToLowerCase;
        type = typeof deep;

        // Convert "deep" to a number between 0 to Infinity or keep special object.
        if (type === 'undefined' || deep === null || deep === 0 || deep === false) {
            deep = 0; // Shallow copy
        }
        else if (type === 'object') {
            if (!(deep instanceof self)) {
                throw new TypeError('Expected "deep" to be a special object');
            }
        }
        else if (deep === true) {
            deep = Infinity; // Deep copy
        }
        else if (type === 'number') {
            if (isNaN(deep) || deep < 0) {
                throw new RangeError(
                    'Expected "deep" to be a positive number, got ' + deep
                );
            }
        }
        else throw new TypeError(
                'Expected "deep" to be a boolean, number or object, got "' + type + '"'
            );


        // Check type of input, and throw if null or not an object.
        if (input === null || typeof input !== 'object') {
            throw new TypeError('Expected "input" to be an object');
        }

        // Check type of filter
        type = typeof filter;
        if (filter === null || type === 'undefined' || type === 'function') {
            filter = filter || null;
        } else {
            throw new TypeError('Expected "filter" to be a function');
        }

        keys = Object.keys(input); // Get own keys from object
        last = keys.length - 1;
        output = {}; // new object

        if (deep) { // only run the deep copy if needed.
            if (typeof deep === 'number') {
                // Create special object to be used during deep copy
                deep =
                    Object.seal(
                        Object.create(
                            self.prototype,
                            {
                                input: {value: []},
                                output: {value: []},
                                level: {value: -1, writable: true},
                                max: {value: deep, writable: false}
                            }
                        )
                    );
            } else {
                // Circle detection
                idx = deep.input.indexOf(input);
                if (~idx) {
                    return deep.output[idx];
                }
            }

            deep.level += 1;
            deep.input.push(input);
            deep.output.push(output);

            idx = last + 1;
            while (idx--) {
                key = keys[last - idx]; // Using [last - idx] to preserve order.
                value = input[key];
                if (typeof value === 'object' && value && deep.level < deep.max) {
                    if (filter ? filter(value) : value.constructor === Object) {
                        value = self(value, deep, filter);
                    }
                }
                output[key.toLowerCase()] = value;
            }
            deep.level -= 1;
        } else {
            // Simple shallow copy
            idx = last + 1;
            while (idx--) {
                key = keys[last - idx]; // Using [last - idx] to preserve order.
                output[key.toLowerCase()] = input[key];
            }
        }
        return output;
    }
}

module.exports = Blog;