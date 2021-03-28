import Check from "../Core/Check.js";
import defaultValue from "../Core/defaultValue.js";
import defined from "../Core/defined.js";
import destroyObject from "../Core/destroyObject.js";
import DeveloperError from "../Core/DeveloperError.js";
import Buffer from "../Renderer/Buffer.js";
import BufferUsage from "../Renderer/BufferUsage.js";
import when from "../ThirdParty/when.js";
import JobType from "./JobType.js";
import ResourceLoader from "./ResourceLoader.js";
import ResourceLoaderState from "./ResourceLoaderState.js";

/**
 * Loads a vertex buffer from a glTF buffer view.
 * <p>
 * Implements the {@link ResourceLoader} interface.
 * </p>
 *
 * @alias GltfVertexBufferLoader
 * @constructor
 * @augments ResourceLoader
 *
 * @param {Object} options Object with the following properties:
 * @param {ResourceCache} options.resourceCache The {@link ResourceCache} (to avoid circular dependencies).
 * @param {Object} options.gltf The glTF JSON.
 * @param {Resource} options.gltfResource The {@link Resource} pointing to the glTF file.
 * @param {Resource} options.baseResource The {@link Resource} that paths in the glTF JSON are relative to.
 * @param {Number} [options.bufferViewId] The bufferView ID corresponding to the vertex buffer.
 * @param {Object} [options.draco] The Draco extension object.
 * @param {String} [options.dracoAttributeSemantic] The Draco attribute semantic, e.g. POSITION or NORMAL.
 * @param {String} [options.cacheKey] The cache key of the resource.
 * @param {Boolean} [options.asynchronous=true] Determines if WebGL resource creation will be spread out over several frames or block until all WebGL resources are created.
 *
 * @exception {DeveloperError} One of options.bufferViewId and options.draco must be defined.
 * @exception {DeveloperError} When options.draco is defined options.dracoAttributeSemantic must also be defined.
 *
 * @private
 */
export default function GltfVertexBufferLoader(options) {
  options = defaultValue(options, defaultValue.EMPTY_OBJECT);
  var resourceCache = options.resourceCache;
  var gltf = options.gltf;
  var gltfResource = options.gltfResource;
  var baseResource = options.baseResource;
  var bufferViewId = options.bufferViewId;
  var draco = options.draco;
  var dracoAttributeSemantic = options.dracoAttributeSemantic;
  var cacheKey = options.cacheKey;
  var asynchronous = defaultValue(options.asynchronous, true);

  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.func("options.resourceCache", resourceCache);
  Check.typeOf.object("options.gltf", gltf);
  Check.typeOf.object("options.gltfResource", gltfResource);
  Check.typeOf.object("options.baseResource", baseResource);

  var hasBufferViewId = defined(bufferViewId);
  var hasDraco = defined(draco);
  var hasDracoAttributeSemantic = defined(dracoAttributeSemantic);

  if (hasBufferViewId === hasDraco) {
    throw new DeveloperError(
      "One of options.bufferViewId and options.draco must be defined."
    );
  }

  if (hasDraco && !hasDracoAttributeSemantic) {
    throw new DeveloperError(
      "When options.draco is defined options.dracoAttributeSemantic must also be defined."
    );
  }

  if (hasDraco) {
    Check.typeOf.object("options.draco", draco);
    Check.typeOf.string(
      "options.dracoAttributeSemantic",
      dracoAttributeSemantic
    );
  }
  //>>includeEnd('debug');

  this._resourceCache = resourceCache;
  this._gltfResource = gltfResource;
  this._baseResource = baseResource;
  this._gltf = gltf;
  this._bufferViewId = bufferViewId;
  this._draco = draco;
  this._dracoAttributeSemantic = dracoAttributeSemantic;
  this._cacheKey = cacheKey;
  this._asynchronous = asynchronous;
  this._bufferViewLoader = undefined;
  this._dracoLoader = undefined;
  this._typedArray = undefined;
  this._vertexBuffer = undefined;
  this._state = ResourceLoaderState.UNLOADED;
  this._promise = when.defer();
}

Object.defineProperties(GltfVertexBufferLoader.prototype, {
  /**
   * A promise that resolves to the resource when the resource is ready.
   *
   * @memberof GltfVertexBufferLoader.prototype
   *
   * @type {Promise.<GltfVertexBufferLoader>}
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
   * @memberof GltfVertexBufferLoader.prototype
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
   * The vertex buffer.
   *
   * @memberof GltfVertexBufferLoader.prototype
   *
   * @type {Buffer}
   * @readonly
   */
  vertexBuffer: {
    get: function () {
      return this._vertexBuffer;
    },
  },
});

/**
 * Loads the resource.
 */
GltfVertexBufferLoader.prototype.load = function () {
  if (defined(this._draco)) {
    loadFromDraco(this);
  } else {
    loadFromBufferView(this);
  }
};

function loadFromDraco(vertexBufferLoader) {
  var resourceCache = vertexBufferLoader._resourceCache;
  var dracoLoader = resourceCache.loadDraco({
    gltf: vertexBufferLoader._gltf,
    draco: vertexBufferLoader._draco,
    gltfResource: vertexBufferLoader._gltfResource,
    baseResource: vertexBufferLoader._baseResource,
    keepResident: false,
  });
  vertexBufferLoader._state = ResourceLoaderState.LOADING;
  vertexBufferLoader._dracoLoader = dracoLoader;

  dracoLoader.promise
    .then(function () {
      if (vertexBufferLoader._state === ResourceLoaderState.DESTROYED) {
        unload(vertexBufferLoader);
        return;
      }
      // Now wait for the GPU buffer to be created in the update loop.
      var decodedData = dracoLoader.decodedData;
      var dracoSemantic = vertexBufferLoader._dracoAttributeSemantic;
      vertexBufferLoader._typedArray = decodedData[dracoSemantic];
    })
    .otherwise(function (error) {
      handleError(vertexBufferLoader, error);
    });
}

function loadFromBufferView(vertexBufferLoader) {
  var resourceCache = vertexBufferLoader._resourceCache;
  var bufferViewLoader = resourceCache.loadBufferView({
    gltf: vertexBufferLoader._gltf,
    bufferViewId: vertexBufferLoader._bufferViewId,
    gltfResource: vertexBufferLoader._gltfResource,
    baseResource: vertexBufferLoader._baseResource,
    keepResident: false,
  });
  vertexBufferLoader._state = ResourceLoaderState.LOADING;
  vertexBufferLoader._bufferViewLoader = bufferViewLoader;

  bufferViewLoader.promise
    .then(function () {
      if (vertexBufferLoader._state === ResourceLoaderState.DESTROYED) {
        unload(vertexBufferLoader);
        return;
      }
      // Now wait for the GPU buffer to be created in the update loop.
      vertexBufferLoader._typedArray = bufferViewLoader.typedArray;
    })
    .otherwise(function (error) {
      handleError(vertexBufferLoader, error);
    });
}

function handleError(vertexBufferLoader, error) {
  unload(vertexBufferLoader);
  vertexBufferLoader._state = ResourceLoaderState.FAILED;
  var errorMessage = "Failed to load vertex buffer";
  error = ResourceLoader.getError(error, errorMessage);
  vertexBufferLoader._promise.reject(error);
}

function CreateVertexBufferJob() {
  this.typedArray = undefined;
  this.context = undefined;
  this.vertexBuffer = undefined;
}

CreateVertexBufferJob.prototype.set = function (typedArray, context) {
  this.typedArray = typedArray;
  this.context = context;
};

CreateVertexBufferJob.prototype.execute = function () {
  this.vertexBuffer = createVertexBuffer(this.typedArray, this.context);
};

function createVertexBuffer(typedArray, context) {
  var vertexBuffer = Buffer.createVertexBuffer({
    typedArray: typedArray,
    context: context,
    usage: BufferUsage.STATIC_DRAW,
  });
  vertexBuffer.vertexArrayDestroyable = false;
  return vertexBuffer;
}

var scratchVertexBufferJob = new CreateVertexBufferJob();

/**
 * Updates the resource.
 *
 * @param {FrameState} frameState The frame state.
 */
GltfVertexBufferLoader.prototype.update = function (frameState) {
  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.object("frameState", frameState);
  //>>includeEnd('debug');

  if (defined(this._vertexBuffer)) {
    // Already created vertex buffer
    return;
  }

  if (!defined(this._typedArray)) {
    // Not ready to create vertex buffer
    return;
  }

  var vertexBuffer;

  if (this._asynchronous) {
    var vertexBufferJob = scratchVertexBufferJob;
    vertexBufferJob.set(this._typedArray, frameState.context);
    var jobScheduler = frameState.jobScheduler;
    if (!jobScheduler.execute(vertexBufferJob, JobType.BUFFER)) {
      // Job scheduler is full. Try again next frame.
      return;
    }
    vertexBuffer = vertexBufferJob.vertexBuffer;
  } else {
    vertexBuffer = createVertexBuffer(this._typedArray, frameState.context);
  }

  // Unload everything except the vertex buffer
  unload(this);

  this._vertexBuffer = vertexBuffer;
  this._state = ResourceLoaderState.READY;
  this._promise.resolve(this);
};

function unload(vertexBufferLoader) {
  if (defined(vertexBufferLoader._vertexBuffer)) {
    vertexBufferLoader._vertexBuffer.destroy();
  }

  var resourceCache = vertexBufferLoader._resourceCache;

  if (defined(vertexBufferLoader._bufferViewLoader)) {
    resourceCache.unload(vertexBufferLoader._bufferViewLoader);
  }

  if (defined(vertexBufferLoader._dracoLoader)) {
    resourceCache.unload(vertexBufferLoader._dracoLoader);
  }

  vertexBufferLoader._bufferViewLoader = undefined;
  vertexBufferLoader._dracoLoader = undefined;
  vertexBufferLoader._typedArray = undefined;
  vertexBufferLoader._vertexBuffer = undefined;
  vertexBufferLoader._gltf = undefined;
}

/**
 * Returns true if this object was destroyed; otherwise, false.
 * <br /><br />
 * If this object was destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
 *
 * @returns {Boolean} <code>true</code> if this object was destroyed; otherwise, <code>false</code>.
 *
 * @see GltfVertexBufferLoader#destroy
 */
GltfVertexBufferLoader.prototype.isDestroyed = function () {
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
 * vertexBufferLoader = vertexBufferLoader && vertexBufferLoader.destroy();
 *
 * @see GltfVertexBufferLoader#isDestroyed
 */
GltfVertexBufferLoader.prototype.destroy = function () {
  unload(this);
  this._state = ResourceLoaderState.DESTROYED;

  return destroyObject(this);
};
