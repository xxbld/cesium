/**
 * Building blocks for creating models.
 *
 * @namespace ModelRuntime
 *
 * @private
 */

function updateVertexAttribute(attribute) {
  attribute.cacheResource.update();
  attribute.vertexBuffer = attribute.cacheResource.vertexBuffer;
  return defined(attribute.vertexBuffer);
}

function updateIndices(indices) {
  indices.cacheResource.update();
  indices.indexBuffer = indices.cacheResource.indexBuffer;
  return defined(indices.indexBuffer);
}

function updateTexture(texture) {
  texture.cacheResource.update();
  texture.texture = texture.cacheResource.texture;
  return defined(texture.texture);
}

function updateFeatureMetadata(featureMetadata) {
  // TODO: eventually there will be feature textures that need to be updated
  return defined(featureMetadata.featureTables);
}

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

ModelRuntime.prototype.unload = function () {};

ModelRuntime.VertexAttribute = VertexAttribute;
ModelRuntime.Indices = Indices;
ModelRuntime.FeatureIdAttribute = FeatureIdAttribute;
ModelRuntime.FeatureIdTexture = FeatureIdTexture;
ModelRuntime.MorphTarget = MorphTarget;
ModelRuntime.Primitive = Primitive;
ModelRuntime.Mesh = Mesh;
ModelRuntime.Instances = Instances;
ModelRuntime.Node = Node;
ModelRuntime.Texture = Texture;
ModelRuntime.Material = Material;

export default ModelRuntime;
