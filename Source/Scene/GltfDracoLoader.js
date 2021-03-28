import Check from "../Core/Check.js";
import defaultValue from "../Core/defaultValue.js";
import defined from "../Core/defined.js";
import destroyObject from "../Core/destroyObject.js";
import when from "../ThirdParty/when.js";
import ResourceLoader from "./ResourceLoader.js";
import ResourceLoaderState from "./ResourceLoaderState.js";

/**
 * Load a draco buffer from a glTF.
 * <p>
 * Implements the {@link ResourceLoader} interface.
 * </p>
 *
 * @alias GltfDracoLoader
 * @constructor
 * @augments ResourceLoader
 *
 * @param {Object} options Object with the following properties:
 * @param {ResourceCache} options.resourceCache The {@link ResourceCache} (to avoid circular dependencies).
 * @param {Object} options.gltf The glTF JSON.
 * @param {Object} options.draco The Draco extension object.
 * @param {Resource} options.gltfResource The {@link Resource} pointing to the glTF file.
 * @param {Resource} options.baseResource The {@link Resource} that paths in the glTF JSON are relative to.
 * @param {String} [options.cacheKey] The cache key of the resource.
 *
 * @private
 */
export default function GltfDracoLoader(options) {
  options = defaultValue(options, defaultValue.EMPTY_OBJECT);
  var resourceCache = options.resourceCache;
  var gltf = options.gltf;
  var draco = options.draco;
  var gltfResource = options.gltfResource;
  var baseResource = options.baseResource;
  var cacheKey = options.cacheKey;

  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.func("options.resourceCache", resourceCache);
  Check.typeOf.object("options.gltf", gltf);
  Check.typeOf.object("options.draco", draco);
  Check.typeOf.object("options.gltfResource", gltfResource);
  Check.typeOf.object("options.baseResource", baseResource);
  //>>includeEnd('debug');

  this._resourceCache = resourceCache;
  this._gltfResource = gltfResource;
  this._baseResource = baseResource;
  this._gltf = gltf;
  this._draco = draco;
  this._cacheKey = cacheKey;
  this._bufferViewLoader = undefined;
  this._bufferViewTypedArray = undefined;
  this._decodePromise = undefined;
  this._decodedData = undefined;
  this._state = ResourceLoaderState.UNLOADED;
  this._promise = when.defer();
}

Object.defineProperties(GltfDracoLoader.prototype, {
  /**
   * A promise that resolves to the resource when the resource is ready.
   *
   * @memberof GltfDracoLoader.prototype
   *
   * @type {Promise.<GltfDracoLoader>}
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
   * @memberof GltfDracoLoader.prototype
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
   * The decoded data.
   *
   * @memberof GltfDracoLoader.prototype
   *
   * @type {Object}
   * @readonly
   */
  decodedData: {
    get: function () {
      return this._decodedData;
    },
  },
});

/**
 * Loads the resource.
 */
GltfDracoLoader.prototype.load = function () {
  var resourceCache = this._resourceCache;
  var bufferViewLoader = resourceCache.loadBufferView({
    gltf: this._gltf,
    bufferViewId: this._draco.bufferView,
    gltfResource: this._gltfResource,
    baseResource: this._baseResource,
    keepResident: false,
  });

  this._state = ResourceLoaderState.LOADING;
  this._bufferViewLoader = bufferViewLoader;

  var that = this;

  bufferViewLoader.promise
    .then(function () {
      if (that._state === ResourceLoaderState.DESTROYED) {
        unload(that);
        return;
      }
      // Now wait for the Draco resources to be created in the update loop.
      that._bufferViewTypedArray = bufferViewLoader.typedArray;
    })
    .otherwise(function (error) {
      handleError(that, error);
    });
};

function handleError(dracoLoader, error) {
  unload(dracoLoader);
  dracoLoader._state = ResourceLoaderState.FAILED;
  var errorMessage = "Failed to load Draco";
  error = ResourceLoader.getError(error, errorMessage);
  dracoLoader._promise.reject(error);
}

/**
 * Updates the resource.
 *
 * @param {FrameState} frameState The frame state.
 */
GltfDracoLoader.prototype.update = function (frameState) {
  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.object("frameState", frameState);
  //>>includeEnd('debug');

  if (!defined(this._bufferViewTypedArray)) {
    // Not ready to decode the Draco buffer
    return;
  }

  if (defined(this._decodePromise)) {
    // Currently decoding
    return;
  }

  var decodePromise = when.resolve(); // TODO
  if (!defined(decodePromise)) {
    // Cannot schedule task this frame
    return;
  }

  var that = this;
  this._decodePromise = decodePromise
    .then(function (decodedData) {
      if (that._state === ResourceLoaderState.DESTROYED) {
        unload(that);
        return;
      }
      // Unload everything except the decoded data
      unload(that);

      that._decodedData = decodedData;
      that._state = ResourceLoaderState.READY;
      that._promise.resolve(that);
    })
    .otherwise(function (error) {
      handleError(that, error);
    });
};

function unload(dracoLoader) {
  if (defined(dracoLoader._bufferViewLoader)) {
    var resourceCache = dracoLoader._resourceCache;
    resourceCache.unload(dracoLoader._bufferViewLoader);
  }

  dracoLoader._bufferViewLoader = undefined;
  dracoLoader._bufferViewTypedArray = undefined;
  dracoLoader._decodedData = undefined;
  dracoLoader._gltf = undefined;
}

/**
 * Returns true if this object was destroyed; otherwise, false.
 * <br /><br />
 * If this object was destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
 *
 * @returns {Boolean} <code>true</code> if this object was destroyed; otherwise, <code>false</code>.
 *
 * @see GltfDracoLoader#destroy
 */
GltfDracoLoader.prototype.isDestroyed = function () {
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
 * dracoLoader = dracoLoader && dracoLoader.destroy();
 *
 * @see GltfDracoLoader#isDestroyed
 */
GltfDracoLoader.prototype.destroy = function () {
  unload(this);
  this._state = ResourceLoaderState.DESTROYED;

  return destroyObject(this);
};
