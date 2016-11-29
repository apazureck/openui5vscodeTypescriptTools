import * as console from 'console';
sap.ui.define([
   "sap/ui/core/UIComponent",
   "sap/ui/model/json/JSONModel"
], function (UIComponent) {
   "use strict";
   return UIComponent.extend("$(projectNamespace).Component", {
      metadata : {
            manifest: "json"
      }
   });
}

namespace $(projectNamespace) {
    class Component extends sap.ui.core.UIComponent {
        init(): void {
         // call the init function of the parent
         UIComponent.prototype.init.apply(this, arguments);
         // set data model
         var oData = {
            recipient : {
               name : "World"
            }
         };
         var oModel = new sap.ui.model.json.JSONModel(oData);
         this.setModel(oModel);
      }
    }
}
