import Check from "../Core/Check.js";
import clone from "../Core/clone.js";
import defaultValue from "../Core/defaultValue.js";
import defined from "../Core/defined.js";
import FeatureDetection from "../Core/FeatureDetection.js";
import when from "../ThirdParty/when.js";
import GltfLoader from "./GltfLoader.js";
import ModelRuntime from "./ModelRuntime.js";
import SceneMode from "./SceneMode.js";

var ModelState = {
  UNLOADED: 0,
  LOADING: 1,
  PROCESSING: 2,
  READY: 3,
  FAILED: 4,
};

export default function Model(options) {
  this._loader = options.loader;
  this._nodes = [];
  this._featureMetadata = undefined;
  this._state = ModelState.UNLOADED;
  this._readyPromise = when.defer();
}

function load(model, frameState) {
  var loader = model._loader;
  if (!defined(loader)) {
    model._state = ModelState.PROCESSING;
    return;
  }

  loader
    .load(model, frameState)
    .then(function () {
      model._state = ModelState.PROCESSING;
    })
    .otherwise(function (error) {
      model._state = ModelState.FAILED;
      model._readyPromise.reject(error);
    });
}

function getComponentsToProcess() {}

function updateNode(loader, node, frameState) {
  var i;
  var j;
  var k;

  var ready = true;

  var mesh = node.mesh;
  if (defined(mesh)) {
    var primitives = mesh.primitives;
    var primitivesLength = primitives.length;
    for (i = 0; i < primitivesLength; ++i) {
      var primitive = primitives[i];
      var vertexAttributes = primitive.vertexAttributes;
      var vertexAttributesLength = vertexAttributes.length;
      for (j = 0; j < vertexAttributesLength; ++j) {
        var vertexAttribute = vertexAttributes[j];
        ready = updateVertexAttribute(vertexAttribute) && ready;
      }
      var morphTargets = primitive.morphTargets;
      var morphTargetsLength = morphTargets.length;
      for (j = 0; j < morphTargetsLength; ++j) {
        var morphTarget = morphTargets[j];
        var morphVertexAttributes = morphTarget.vertexAttributes;
        var morphVertexAttributesLength = morphVertexAttributes.length;
        for (k = 0; k < morphVertexAttributesLength; ++k) {
          var morphVertexAttribute = morphVertexAttributes[k];
          ready = updateVertexAttribute(morphVertexAttribute) && ready;
        }
      }
      var indices = primitive.indices;
      if (defined(indices)) {
        ready = updateIndices(indices) && ready;
      }
      var material = primitive.material;
      if (defined(material)) {
        if (defined(material.baseColorTexture)) {
          ready = updateTexture(material.baseColorTexture) && ready;
        }
        if (defined(material.metallicRoughnessTexture)) {
          ready = updateTexture(material.metallicRoughnessTexture) && ready;
        }
        if (defined(material.diffuseTexture)) {
          ready = updateTexture(material.diffuseTexture) && ready;
        }
        if (defined(material.specularGlossinessTexture)) {
          ready = updateTexture(material.specularGlossinessTexture) && ready;
        }
        if (defined(material.emissiveTexture)) {
          ready = updateTexture(material.emissiveTexture) && ready;
        }
        if (defined(material.normalTexture)) {
          ready = updateTexture(material.normalTexture) && ready;
        }
        if (defined(material.occlusionTexture)) {
          ready = updateTexture(material.occlusionTexture) && ready;
        }
      }
    }
  }

  var instances = node.instances;
  if (defined(instances)) {
    var instanceAttributes = instances.instanceAttributes;
    var instanceAttributesLength = instanceAttributes.length;
    for (i = 0; i < instanceAttributesLength; ++i) {
      var instanceAttribute = instanceAttributes[i];
      ready = updateVertexAttribute(instanceAttribute) && ready;
    }
  }

  // Recurse over children
  var childrenLength = node.children.length;
  for (i = 0; i < childrenLength; ++i) {
    var child = node.children[i];
    ready = updateNode(loader, child, frameState) && ready;
  }

  return ready;
}

ModelRuntime.prototype.update = function (frameState) {
  var ready = true;
  var nodes = this.nodes;
  var nodesLength = nodes.length;
  for (var i = 0; i < nodesLength; ++i) {
    ready = updateNode(this, nodes[i], frameState) && ready;
  }

  var featureMetadata = this.featureMetadata;
  if (defined(featureMetadata)) {
    ready = updateFeatureMetadata(featureMetadata) && ready;
  }

  return ready;
};

Model.prototype.update = function (frameState) {
  if (!FeatureDetection.supportsWebP.initialized) {
    FeatureDetection.supportsWebP.initialize();
    return;
  }

  if (frameState.mode === SceneMode.MORPHING) {
    return;
  }

  var context = frameState.context;
  this._defaultTexture = context.defaultTexture;

  var loader = this._loader;

  if (this._state === ModelState.UNLOADED) {
    this._state = ModelState.LOADING;
    load(model, frameState);
  }

  if (this._state === ModelState.PROCESSING) {
    var ready = update(model, frameState);

    if (defined(loader)) {
      loader.update(this, frameState);
      if (defined(loader.error)) {
        this._state = ModelState.FAILED;
        this._readyPromise.reject(loader.error);
        return;
      }
    }

    if (!defined(loader) || loader.ready) {
      createCommands(model);
      this._state = ModelState.READY;
    }
  }

  if (this._state === ModelState.READY) {
  }
};

/**
 * @param {Object} options Object with the following properties:
 * @param {Resource|String} options.url The url to the .gltf file.
 * @param {Resource|String} [options.basePath] The base path that paths in the glTF JSON are relative to.
 *
 * @returns {Model} The newly created model.
 */
Model.fromGltf = function (options) {
  options = defined(options)
    ? clone(options, false)
    : defaultValue.EMPTY_OBJECT;

  var url = options.url;
  var basePath = options.basePath;
  var keepResident = defaultValue(options.keepResident, false); // Undocumented option

  //>>includeStart('debug', pragmas.debug);
  Check.defined("options.url", url);
  //>>includeEnd('debug');

  var loaderOptions = {
    uri: url,
    basePath: basePath,
    keepResident: keepResident,
  };

  // Prepare options for Model
  options.loader = new GltfLoader(loaderOptions);

  delete options.url;
  delete options.basePath;
  delete options.keepResident;

  return new Model(options);
};

/**
 * Returns true if this object was destroyed; otherwise, false.
 * <br /><br />
 * If this object was destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
 *
 * @returns {Boolean} <code>true</code> if this object was destroyed; otherwise, <code>false</code>.
 *
 * @see Model#destroy
 */
Model.prototype.isDestroyed = function () {
  return false;
};

Model.prototype.destroy = function () {
  this._loader.destroy();
};

Model.VertexAttribute = VertexAttribute;
Model.Indices = Indices;
Model.FeatureIdAttribute = FeatureIdAttribute;
Model.FeatureIdTexture = FeatureIdTexture;
Model.MorphTarget = MorphTarget;
Model.Primitive = Primitive;
Model.Mesh = Mesh;
Model.Instances = Instances;
Model.Node = Node;
Model.Texture = Texture;
Model.Material = Material;
