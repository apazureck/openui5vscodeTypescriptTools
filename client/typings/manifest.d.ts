declare interface Manifest {
    "sap.ui5": sap.ui5;
}

declare interface Targets {
    [name: string]: Target;
}

declare interface Target {
    viewName: string;
    transition: string;
}

declare interface Route {
    pattern: string;
    name: string;
    target: string;
}

declare namespace sap {
    interface ui5 {
        routing: {
            routes?: Route[];
            targets?: Targets;
            config: {
            routerClass: string;
            viewType: ViewType;
            viewPath: string;
            controlId: string;
            controlAggregation: string;
            async: boolean;
            transition: string;
            }
        }
    }
}

declare enum ViewType {
	XML, JSON
}