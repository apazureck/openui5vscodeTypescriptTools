declare interface Manifest {
    "sap.ui5": sap.ui5;
}

declare interface Routing {
    routes?: Route[];
    targets?: Targets;
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
        routing: Routing;
    }
}