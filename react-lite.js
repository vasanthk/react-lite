/**                          */
/** REACT DOM TEXT COMPONENT */
/**                          */

// Component class used to represent text render/update/delete
function ReactDOMTextComponent(text) {
  // Saves text passed through
  this._currentElement = '' + text;
  // Root NodeID is used to identify the current DOMTextComponent
  this._rootNodeID = null;
}

// Handles Mount - Here's where the component render generates it's corresponding DOM structure.
ReactDOMTextComponent.prototype.mountComponent = function (rootID) {
  this._rootNodeID = rootID;
  return '<span data-reactid="' + rootID + '">' + this._currentElement + '</span>';
};

ReactDOMTextComponent.prototype.receiveComponent = function (nextText) {
  var nextStringText = '' + nextText;
  // Comparison with the previously saved string
  if (nextStringText !== this._currentElement) {
    this._currentElement = nextStringText;
    // Replace entire node
    $('[data-reactid="' + this._rootNodeID + '"]').html(this._currentElement);
  }
};

/**                     */
/** REACT DOM COMPONENT */
/**                     */

// Component class used to represent HTML tag DOM elements' render/update/delete
function ReactDOMComponent(element) {
  // Save the current element object's reference
  this._currentElement = element;
  this._rootNodeID = null;
}

// Mounting the component to generate the DOM element structure.
ReactDOMComponent.prototype.mountComponent = function (rootID) {
  // Copy root id to the instance.
  this._rootNodeID = rootID;
  var props = this._currentElement.props;
  var tagOpen = '<' + this._currentElement.type;
  var tagClose = '</' + this._currentElement.type + '>';

  // Add react-id identification to the node as a data attribute.
  // The data-reactid attribute is a custom attribute used so that React can uniquely identify its components within the DOM.
  // This is important because React applications can be rendered at the server as well as the client.
  //
  // More: http://stackoverflow.com/a/33967810/1672655
  // React 15 uses document.createElement instead, so client rendered markup won't include these attributes anymore.
  tagOpen += ' data-reactid="' + this._rootNodeID + '"';

  // Put together prop values into the tag
  for (var propKey in props) {
    // Handle EventListeners passed in props - identified via regex.
    if (/^on[A-Za-z]/.test(propKey)) {
      var eventType = propKey.replace('on', '');
      // Add the event listener as a custom event on the current DOM node - identfied via the rootNodeId values.
      $(document).delegate('[data-reactid="' + this._rootNodeID + '"]', eventType + '.' + this._rootNodeID, props[propKey]);
    }

    // Ignore children and event listener props. -- Rest of the props are assigned as attributes to the DOM element.
    if (props[propKey] && propKey !== 'children' && !/^on[A-Za-z]/.test(propKey)) {
      tagOpen += ' ' + propKey + '="' + props[propKey] + '"';
    }
  }

  // Recursively get the child nodes' render() content as well.
  var content = '';
  var children = props.children || [];

  // Book-keeping: Save component instances of all children.
  var childrenInstances = [];
  var that = this;
  $.each(children, function (key, child) {
    var childComponentInstance = instantiateReactComponent(child);
    childComponentInstance._mountIndex = key;

    childrenInstances.push(childComponentInstance);
    // Root id of children is calculated by concatenating it with the rootId of the parent.
    var curRootId = that._rootNodeID + '.' + key;
    //
    var childMarkup = childComponentInstance.mountComponent(curRootId);
    // Concatenate together the markup obtained
    content += ' ' + childMarkup;
  });

  // The children instances are saved to the current DOM component instance
  this._renderedChildren = childrenInstances;

  // Return the final markup of the DOM component
  return tagOpen + '>' + content + tagClose;
};

// Tag elements mainly have 2 types of updates
// 1. Attribute property updates - including events
// 2. Updates to child nodes (more complex)
//
// In order to do updates efficiently, we need to do it in 2 steps:
// Diff - Take a new child node tree and compare it with the previous old child nodes of the tree, to find out the differences between them.
// Patch - After all differences are found out, do a one-time update.
// Tip: All Reads + All writes is far more performant that RWRWRW - because browser does a bunch of recals/pains on every RW cycle.
ReactDOMComponent.prototype.receiveComponent = function (nextElement) {
  var lastProps = this._currentElement.props;
  var nextProps = nextElement.props;

  this._currentElement = nextElement;
  // Update DOM properties
  this._updateDOMProperties(lastProps, nextProps);
  // Update DOM children
  this._updateDOMChildren(nextElement.props.children);
};

ReactDOMComponent.prototype._updateDOMProperties = function (lastProps, nextProps) {
  var propKey;

  // If an old attribute/event is not part of the new props - Remove attribute/event listener.
  for (propKey in lastProps) {
    // Continue loop if old prop is still passed in as a part of the new props.
    if (nextProps.hasOwnProperty(propKey) || !lastProps.hasOwnProperty(propKey)) {
      continue;
    }
    // Remove event listeners if they are not part of the new props anymore.
    if (/^on[A-Za-z]/.test(propKey)) {
      var eventType = propKey.replace('on', '');
      // Remove event listener for the current node.
      $(document).undelegate('[data-reactid="' + this._rootNodeID + '"]', eventType, lastProps[propKey]);
      continue;
    }

    // Remove old attribute/events that are not part of the new props
    $('[data-reactid="' + this._rootNodeID + '"]').removeAttr(propKey)
  }

  // For new attributes, write it to DOM node
  for (propKey in nextProps) {
    // Check if event listener using regex.
    if (/^on[A-Za-z]/.test(propKey)) {
      var eventType = propKey.replace('on', '');
      // Remove previously attached eventType specific event listeners for the node (generic event)
      lastProps[propKey] && $(document).undelegate('[data-reactid="' + this._rootNodeID + '"]', eventType, lastProps[propKey]);
      // Add an event listener for the current node with the _rootNodeID namespace (custom Event)
      $(document).delegate('[data-reactid="' + this._rootNodeID + '"]', eventType + '.' + this._rootNodeID, nextProps[propKey]);
      continue;
    }

    if (propKey === 'children') {
      continue;
    }

    // Add a new property, or update old property
    $('[data-reactid="' + this._rootNodeID + '"]').prop(propKey, nextProps[propKey])
  }
};

// Keep track of the current update depth.
var updateDepth = 0;
// All the diffs are pushed to this global array.
var diffQueue = [];

ReactDOMComponent.prototype._updateDOMChildren = function (nextChildrenElements) {
  updateDepth++;
  // _ diff the tree recursively to find the difference - this diff is add to the update queue diffQueue.
  this._diff(diffQueue, nextChildrenElements);
  updateDepth--;
  if (updateDepth == 0) {
    // Call this finally to make a batched update/patch to the DOM
    this._patch(diffQueue);
    diffQueue = [];
  }
};

// NOTE:
// 1. The _diff internal recursive calls will call the child nodes' receiveComponent.
// 2. When a child node is an ordinary browser node, it will go to _updateDOMChildren() in this step.
// 3. We use `updateDepth` to record the recursive process, only to come back recursively to updateDepth 0.
// 4. When depth is back to 0 - this means the diff has been analyzed of the trees have been analyzed
// 5. We can now start making patch updates based on the differences in the queue.

// Types of DOM updates
var UPDATE_TYPES = {
  MOVE_EXISTING: 1,
  REMOVE_NODE: 2,
  INSERT_MARKUP: 3
};

// Book keeping - This is an object of element keys mapped to children
//
// Normal children is an array, this method converts it to a map.
// key element is the key
// - If the key is not passed or if the node is a text element - we use the array index converted to base 36 instead.
//
// This key is later used during diffing to determine if the nodes in both the trees are derived form the same component.
function flattenChildren(componentChildren) {
  var child;
  var name;
  var childrenMap = {};
  for (var i = 0; i < componentChildren.length; i++) {
    child = componentChildren[i];
    name = child && child._currentElement && child._currentElement.key ? child._currentElement.key : i.toString(36);
    // Note: toString(36) - converts to base 36 (hexatrigesimal) to allow large ints
    childrenMap[name] = child;
  }
  return childrenMap;
}

// Child node elements mainly used to generate a set of components
// There is a logic to check:
// 1. If has been updated in th past, if so - it will continue to use the previous componentInstance & call the corresponding receiveComponent().
// 2. If it is a new node, it will create a new componentInstance,
function generateComponentChildren(prevChildren, nextChildrenElements) {
  var nextChildren = {};
  nextChildrenElements = nextChildrenElements || [];
  $.each(nextChildrenElements, function (index, element) {
    var name = element.key ? element.key : index;
    var prevChild = prevChildren && prevChildren[name];
    var prevElement = prevChild && prevChild._currentElement;
    var nextElement = element;

    // Call _shouldUpdateReactComponent() to determine whether the update is required
    if (_shouldUpdateReactComponent(prevElement, nextElement)) {
      // To update call receiveComponent()
      prevChild.receiveComponent(nextElement);
      // Save the updated child instance to `nextChildren`
      nextChildren[name] = prevChild;
    } else {
      // If not an update - create a new instance
      var nextChildInstance = instantiateReactComponent(nextElement, null);
      // Save the new child instance to `nextChildren`
      nextChildren[name] = nextChildInstance;
    }
  });

  return nextChildren;
}

// _ diff() recursively to find the difference - then add it to the update queue diffQueue.
ReactDOMComponent.prototype._diff = function (diffQueue, nextChildrenElements) {
  var self = this;
  // _renderedChildren - originally an array, we make it into an object Map
  var prevChildren = flattenChildren(self._renderedChildren);
  // Set of component objects generate a new child node, where attention will reuse the old component objects
  var nextChildren = generateComponentChildren(prevChildren, nextChildrenElements);
  self._renderedChildren = [];
  // Update rendered children array with the the latest component instance
  $.each(nextChildren, function (key, instance) {
    self._renderedChildren.push(instance);
  });

  // The index of the last visited node
  var lastIndex = 0;
  // The index of the next node to be visited
  var nextIndex = 0;
  // Placeholder name variable used in loops.
  var name;

  // Compare the differences between two sets and add nodes to the queue
  for (name in nextChildren) {
    if (!nextChildren.hasOwnProperty(name)) {
      continue;
    }
    var prevChild = prevChildren && prevChildren[name];
    var nextChild = nextChildren[name];
    // If the same reference -- same words/description is used for a component - we need to do a MOVE operation
    if (prevChild === nextChild) {
      // Add properties to diff queue
      // TYPE：MOVE_EXISTING
      prevChild._mountIndex < lastIndex && diffQueue.push({
        parentId: self._rootNodeID,
        parentNode: $('[data-reactid="' + self._rootNodeID + '"]'),
        type: UPDATE_TYPES.MOVE_EXISTING,
        fromIndex: prevChild._mountIndex,
        toIndex: nextIndex
      });
      lastIndex = Math.max(prevChild._mountIndex, lastIndex);
    } else { // If not identical -- meaning we need to newly add or remove node.
      // But if there is still the old, that is a different element, but the same component. We need to delete the corresponding old element.
      if (prevChild) {
        // Add properties to diff queue，
        // TYPE：REMOVE_NODE
        diffQueue.push({
          parentId: self._rootNodeID,
          parentNode: $('[data-reactid="' + self._rootNodeID + '"]'),
          type: UPDATE_TYPES.REMOVE_NODE,
          fromIndex: prevChild._mountIndex,
          toIndex: null
        });

        // If you have previously rendered it - remember to remove all previous namespaced event listeners.
        if (prevChild._rootNodeID) {
          $(document).undelegate('[data-reactid="' + prevChild._rootNodeID + '"]');
        }
        lastIndex = Math.max(prevChild._mountIndex, lastIndex);
      }

      // Add properties to diff queue，
      // TYPE：INSERT_MARKUP
      diffQueue.push({
        parentId: self._rootNodeID,
        parentNode: $('[data-reactid="' + self._rootNodeID + '"]'),
        type: UPDATE_TYPES.INSERT_MARKUP,
        fromIndex: null,
        toIndex: nextIndex,
        markup: nextChild.mountComponent(self._rootNodeID + '.' + name) // Extra key in object to indicate the content of new DOM node.
      });
    }
    // Update the mount index.
    nextChild._mountIndex = nextIndex;
    nextIndex++;
  }

  // For old nodes with no new nodes - remove them all.
  for (name in prevChildren) {
    if (prevChildren.hasOwnProperty(name) && !(nextChildren && nextChildren.hasOwnProperty(name))) {
      // Add properties to diff queue,
      // TYPE：REMOVE_NODE
      diffQueue.push({
        parentId: self._rootNodeID,
        parentNode: $('[data-reactid="' + self._rootNodeID + '"]'),
        type: UPDATE_TYPES.REMOVE_NODE,
        fromIndex: prevChildren[name]._mountIndex,
        toIndex: null
      });
      if (prevChildren[name]._rootNodeID) {
        $(document).undelegate('[data-reactid="' + prevChildren._rootNodeID + '"]');
      }
      // Side Note:
      // If a DOM element is removed and is reference-free (no references pointing to it)
      // then the element is picked up by the garbage collector
      // and any event handlers/listeners associated with it are alss removed.
    }
  }
};

// For inserting child nodes into a specific
function insertChildAt(parentNode, childNode, index) {
  var beforeChild = parentNode.children().get(index);
  beforeChild ? childNode.insertBefore(beforeChild) : childNode.appendTo(parentNode);

  // ANOTHER WAY TO DO THIS:
  // var beforeChild = index >= parentNode.childNodes.length ? null : parentNode.childNodes.item(index);
  // parentNode.insertBefore(childNode, beforeChild);
}

ReactDOMComponent.prototype._patch = function (updates) {
  var update;
  var initialChildren = {};
  var deleteChildren = [];
  for (var i = 0; i < updates.length; i++) {
    update = updates[i];
    if (update.type === UPDATE_TYPES.MOVE_EXISTING || update.type === UPDATE_TYPES.REMOVE_NODE) {
      var updatedIndex = update.fromIndex;
      var updatedChild = $(update.parentNode.children().get(updatedIndex));
      var parentId = update.parentId;

      // Need to update all nodes - Saved for later use.
      initialChildren[parentId] = initialChildren[parentId] || [];
      // Use parentID as a simple namespace
      initialChildren[parentId][updatedIndex] = updatedChild;

      // For the node to be moved:
      // 1. First need to delete the node.
      // 2. Re-insert it into the correct position.
      deleteChildren.push(updatedChild)
    }
  }
  // Do Step 1 of Move - Delete
  $.each(deleteChildren, function (index, child) {
    $(child).remove();
  });

  // Iterate once again, this time Step 2 - Insert it back to the new position.
  for (var k = 0; k < updates.length; k++) {
    update = updates[k];
    switch (update.type) {
      case UPDATE_TYPES.INSERT_MARKUP:
        insertChildAt(update.parentNode, $(update.markup), update.toIndex);
        break;
      case UPDATE_TYPES.MOVE_EXISTING:
        insertChildAt(update.parentNode, initialChildren[update.parentID][update.fromIndex], update.toIndex);
        break;
      case UPDATE_TYPES.REMOVE_NODE:
        // This has already been handled in the previous for-loop.
        break;
    }
  }
};

/**                           */
/** REACT COMPOSITE COMPONENT */
/**                           */

function ReactCompositeComponent(element) {
  // Save the current element object's reference.
  this._currentElement = element;
  // To store the node reference.
  this._rootNodeID = null;
  // To store the corresponding instance of ReactClass later on.
  this._instance = null;
}

// Mounting the component to generate the DOM element structure.
// Should return the current custom elements' render contents.
ReactCompositeComponent.prototype.mountComponent = function (rootID) {
  this._rootNodeID = rootID;
  // The current element's prop values.
  var publicProps = this._currentElement.props;
  // The current element's ReactClass (Component class).
  var ReactClass = this._currentElement.type;
  // Initialize the public class
  var inst = new ReactClass(publicProps);
  this._instance = inst;
  // Maintain reference to the current component - for future updates.
  inst._reactInternalInstance = this;

  if (inst.componentWillMount) {
    inst.componentWillMount();
    // There is a lot more additional logic here in the complete library - but we'll keep it simple here.
  }
  // Call the ReactClass instance's render method - this returns an element or a text node
  var renderedElement = this._instance.render();
  // Get component class instance of the rendered element.
  var renderedComponentInstance = instantiateReactComponent(renderedElement);
  this._renderedComponent = renderedComponentInstance; // Save component instance for later use.

  // Get string content after rendering, the current _rootNodeID passed to render the node.
  var renderedMarkup = renderedComponentInstance.mountComponent(this._rootNodeID);

  // Add an event listener for 'mountReady' event - which is triggered when React.render() completes.
  $(document).on('mountReady', function () {
    // call inst.componentDidMount
    inst.componentDidMount && inst.componentDidMount();
  });

  return renderedMarkup;
};

// Update
ReactCompositeComponent.prototype.receiveComponent = function (nextElement, newState) {
  // If nextElement is passed - it becomes the current element (we pass nextElement below while recursing)
  this._currentElement = nextElement || this._currentElement;

  var inst = this._instance;
  // Merge state and assign props.
  var nextState = $.extend(inst.state, newState);
  var nextProps = this._currentElement.props;

  // Update state & props in instance
  inst.state = nextState;
  inst.props = nextProps;

  // If there is shouldComponentUpdate inst and returns false. Do not update the component - just return.
  if (inst.shouldComponentUpdate && (inst.shouldComponentUpdate(nextProps, nextState) === false)) {
    return;
  }

  // If there is componentWillUpdate - Call it to indicate start of update.
  if (inst.componentWillUpdate) {
    inst.componentWillUpdate(nextProps, nextState);
  }

  var prevComponentInstance = this._renderedComponent;
  var prevRenderedElement = prevComponentInstance._currentElement;
  // Execute render for the current instance.
  var nextRenderedElement = this._instance.render();

  // Condition checks if the component needs to be updated or render a completely different element (replace).
  // Note that the _shouldUpdateReactComponent is a global method and different from the component's shouldComponentUpdate
  if (_shouldUpdateReactComponent(prevRenderedElement, nextRenderedElement)) {
    // If you need to update, continue to call the child node receiveComponent method, passing the new element updating child nodes.
    prevComponentInstance.receiveComponent(nextRenderedElement);
    // Complete update by calling the component's corresponding componentDidUpdate()
    inst.componentDidUpdate && inst.componentDidUpdate();
  } else {
    // If you find two completely different element, then just re-render the
    var thisID = this._rootNodeID;
    // Instantiate the corresponding Component.
    this._renderedComponent = this._instantiateReactComponent(nextRenderedElement);
    // Mount the corresponding component and get its DOM content.
    var nextMarkup = _renderedComponent.mountComponent(thisID);
    // Replace the entire node.
    $('[data-reactid="' + this._rootNodeID + '"]').replaceWith(nextMarkup);
  }
};

// Used to compare two elements and determine if update is needed
// Checks if element types are the same and if an object also checks for the `key` which uniquely identifies the element.
var _shouldUpdateReactComponent = function (prevElement, nextElement) {
  if (prevElement && nextElement) {
    var prevType = typeof prevElement;
    var nextType = typeof nextElement;
    if (prevType === 'string' || prevType === 'number') {
      return nextType === 'string' || nextType === 'number';
    } else {
      return nextType === 'object' && prevElement.type === nextElement.type && prevElement.key === nextElement.key;
    }
  }
  return false;
};

function instantiateReactComponent(node) {
  // If a text node
  if (typeof node === 'string' || typeof node === 'number') {
    return new ReactDOMTextComponent(node);
  }
  // If a browser tag/node
  if (typeof node === 'object' && typeof node.type === 'string') {
    return new ReactDOMComponent(node);
  }
  // If composite element node
  if (typeof node === 'object' && typeof node.type === 'function') {
    return new ReactCompositeComponent(node);
  }
}

// React Element's instance is basically what we call the Virtual DOM.
// It has a type attribute representing the current node type, as well as props attribute for the node.
// Also here the `key` is used to uniquely identify this element regardless of where you are in the DOM tree + optimizations for future updates
function ReactElement(type, key, props) {
  this.type = type;
  this.key = key;
  this.props = props;
}

// ReactClass - In a way this is the super class
// For demo purposes, we're keep ReactClass simple - the original code handles a lot of things,
// eg. mixin class inheritance support, componentDidMount etc.
var ReactClass = function () {
};

// This leaves subclasses to inherit the render
ReactClass.prototype.render = function () {
};

// setState
ReactClass.prototype.setState = function (newState) {
  // Remember when we mount the ReactCompositeComponent - we save a reference to its instance.
  // So here, we can get the corresponding ReactCompositeComponent instance _reactInternalInstance
  // and call its receiveComponent() - which handles updates to a component.
  this._reactInternalInstance.receiveComponent(null, newState);
  // Note:
  // mountComponent is implemented to deal with the component's initial rendering.
  // receiveComponent - should be implemented in all classes that need to handle their own updates.
};

React = {
  nextReactRootIndex: 0,
  createClass: function (spec) {
    // Generate a subclass
    var Constructor = function (props) {
      this.props = props;
      this.state = this.getInitialState ? this.getInitialState() : null;
    };
    // Prototype Inheritance
    // This is a way to implement two levels of inheritance with constructor.
    // If not clear check this: http://stackoverflow.com/a/7719184/1672655
    Constructor.prototype = new ReactClass();        // (or) Object.create(ReactClass.prototype)
    Constructor.prototype.constructor = Constructor; // Setting back the constructor to `Constructor`

    // Combine spec with prototype
    $.extend(Constructor.prototype, spec);
    return Constructor;
  },
  createElement: function (type, config, children) {
    var props = {};
    var propName;
    config = config || {};
    // Check if the key is specified - if so it is easy to quickly identify and update the element in future.
    var key = config.key || null;

    // Copy config object over as props.
    for (propName in config) {
      if (config.hasOwnProperty(propName) && propName !== 'key') {
        props[propName] = config[propName];
      }
    }

    // Handle children - which can be passed as additional params to createElement()
    var childrenLength = arguments.length - 2;
    if (childrenLength === 1) {
      props.children = Array.isArray(children) ? children : [children];
    } else if (childrenLength > 1) {
      var childArray = [];
      for (var i = 0; i < childrenLength; i++) {
        childArray[i] = arguments[i + 2];
      }
      props.children = childArray;
    }

    return new ReactElement(type, key, props);
  },
  render: function (element, container) {
    var componentInstance = instantiateReactComponent(element);
    var markup = componentInstance.mountComponent(React.nextReactRootIndex++);
    $(container).html(markup);
    // Trigger the mount complete event
    $(document).trigger('mountReady');
  }
};