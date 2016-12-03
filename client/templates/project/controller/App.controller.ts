sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/base/Event",
    "sap/ui/model/json/JSONModel"
], function (BaseController) {
    "use strict";
    return BaseController.extend("$(projectNamespace).controller.App");
    });

namespace $(projectNamespace).controller {
    export class App extends sap.ui.core.mvc.Controller {
        onInit(): void {
         // set data model on view
         let oData = {
            recipient : {
               name : "Typescript!"
            }
         };
         let oModel = new sap.ui.model.json.JSONModel(oData);
         this.getView().setModel(oModel);
        // set i18n model on view
         let i18nModel = new sap.ui.model.resource.ResourceModel({
            bundleName: "$(projectNamespace).i18n.i18n"
         });
         this.getView().setModel(i18nModel, "i18n");
      }

      onShowHello(): void {
         // read msg from i18n model
         let oBundle = this.getView().getModel("i18n").getResourceBundle();
         let sRecipient = this.getView().getModel().getProperty("/recipient/name");
         let sMsg = oBundle.getText("helloMsg", [sRecipient]);
         // show message
         sap.m.MessageToast.show(sMsg);
      }
    }
}
