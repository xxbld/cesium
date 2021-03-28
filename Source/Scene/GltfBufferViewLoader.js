import Check from "../Core/Check.js";
import defaultValue from "../Core/defaultValue.js";
import defined from "../Core/defined.js";
import destroyObject from "../Core/destroyObject.js";
import when from "../ThirdParty/when.js";
import ResourceLoader from "./ResourceLoader.js";
import ResourceLoaderState from "./ResourceLoaderState.js";

/**
 * Loads a glTF buffer view.
 * <p>
 * Implements the {@link ResourceLoader} interface.
 * </p>
 *
 * @alias GltfBufferViewLoader
 * @constructor
 * @augments ResourceLoader
 *
 * @param {Object} options Object with the following properties:
 * @param {ResourceCache} options.resourceCache The {@link ResourceCache} (to avoid circular dependencies).
 * @param {Object} options.gltf The glTF JSON.
 * @param {Number} options.bufferViewId The buffer view ID.
 * @param {Resource} options.gltfResource The {@link Resource} pointing to the glTF file.
 * @param {Resource} options.baseResource The {@link Resource} that paths in the glTF JSON are relative to.
 * @param {String} [options.cacheKey] The cache key of the resource.
 *
 * @private
 */
export default function GltfBufferViewLoader(options) {
  options = defaultValue(options, defaultValue.EMPTY_OBJECT);
  var resourceCache = options.resourceCache;
  var gltf = options.gltf;
  var bufferViewId = options.bufferViewId;
  var gltfResource = options.gltfResource;
  var baseResource = options.baseResource;
  var cacheKey = options.cacheKey;

  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.func("options.resourceCache", resourceCache);
  Check.typeOf.object("options.gltf", gltf);
  Check.typeOf.number("options.bufferViewId", bufferViewId);
  Check.typeOf.object("options.gltfResource", gltfResource);
  Check.typeOf.object("options.baseResource", baseResource);
  //>>includeEnd('debug');

  var bufferView = gltf.bufferViews[bufferViewId];
  var bufferId = bufferView.buffer;
  var buffer = gltf.buffers[bufferId];

  this._resourceCache = resourceCache;
  this._gltfResource = gltfResource;
  this._baseResource = baseResource;
  this._buffer = buffer;
  this._bufferId = bufferId;
  this._byteOffset = bufferView.byteOffset;
  this._byteLength = bufferView.byteLength;
  this._cacheKey = cacheKey;
  this._bufferLoader = undefined;
  this._typedArray = undefined;
  this._state = ResourceLoaderState.UNLOADED;
  this._promise = when.defer();
}

Object.defineProperties(GltfBufferViewLoader.prototype, {
  /**
   * A promise that resolves to the resource when the resource is ready.
   *
   * @memberof GltfBufferViewLoader.prototype
   *
   * @type {Promise.<GltfBufferViewLoader>}
   * @readonly
   */
  promise: {
    get: function () {
      return this._promise.promise;
    },
  },
  /**
   * The cache key of the resource.
   *
   * @memberof GltfBufferViewLoader.prototype
   *
   * @type {String}
   * @readonly
   */
  cacheKey: {
    get: function () {
      return this._cacheKey;
    },
  },
  /**
   * The typed array containing buffer view data.
   *
   * @memberof GltfBufferViewLoader.prototype
   *
   * @type {Uint8Array}
   * @readonly
   */
  typedArray: {
    get: function () {
      return this._typedArray;
    },
  },
});

/**
 * Loads the resource.
 */
GltfBufferViewLoader.prototype.load = function () {
  var bufferLoader = getBufferLoader(this);
  this._state = ResourceLoaderState.LOADING;
  this._bufferLoader = bufferLoader;

  var that = this;

  bufferLoader.promise
    .then(function () {
      if (that._state === ResourceLoaderState.DESTROYED) {
        unload(that);
        return;
      }
      var bufferTypedArray = bufferLoader.typedArray;
      var bufferViewTypedArray = new Uint8Array(
        bufferTypedArray.buffer,
        bufferTypedArray.byteOffset + that._byteOffset,
        that._byteLength
      );
      // Keep bufferLoader loaded since we're still holding onto a view of the
      // buffer and not ready to release it.
      that._typedArray = bufferViewTypedArray;
      that._state = ResourceLoaderState.READY;
      that._promise.resolve(that);
    })
    .otherwise(function (error) {
      unload(that);
      that._state = ResourceLoaderState.FAILED;
      var errorMessage = "Failed to load buffer view";
      that._promise.reject(ResourceLoader.getError(error, errorMessage));
    });
};

function getBufferLoader(bufferViewLoader) {
  var resourceCache = bufferViewLoader._resourceCache;
  var buffer = bufferViewLoader._buffer;
  if (defined(buffer.uri)) {
    var baseResource = bufferViewLoader._baseResource;
    var resource = baseResource.getDerivedResource({
      url: buffer.uri,
    });
    return resourceCache.loadExternalBuffer({
      resource: resource,
      keepResident: false,
    });
  }
  return resourceCache.loadEmbeddedBuffer({
    parentResource: bufferViewLoader._gltfResource,
    bufferId: bufferViewLoader._bufferId,
    keepResident: false,
  });
}

function unload(bufferViewLoader) {
  if (defined(bufferViewLoader._bufferLoader)) {
    var resourceCache = bufferViewLoader._resourceCache;
    resourceCache.unload(bufferViewLoader._bufferLoader);
  }

  bufferViewLoader._bufferLoader = undefined;
  bufferViewLoader._typedArray = undefined;
}

/**
 * Returns true if this object was destroyed; otherwise, false.
 * <br /><br />
 * If this object was destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
 *
 * @returns {Boolean} <code>true</code> if this object was destroyed; otherwise, <code>false</code>.
 *
 * @see GltfBufferViewLoader#destroy
 */
GltfBufferViewLoader.prototype.isDestroyed = function () {
  return false;
};

/**
 * Destroys the loaded resource.
 * <br /><br />
 * Once an object is destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.  Therefore,
 * assign the return value (<code>undefined</code>) to the object as done in the example.
 *
 * @exception {DeveloperError} This object was destroyed, i.e., destroy() was called.
 *
 * @example
 * bufferViewLoader = bufferViewLoader && bufferViewLoader.destroy();
 *
 * @see GltfBufferViewLoader#isDestroyed
 */
GltfBufferViewLoader.prototype.destroy = function () {
  unload(this);
  this._state = ResourceLoaderState.DESTROYED;

  return destroyObject(this);
};
