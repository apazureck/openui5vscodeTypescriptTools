import { Gulpclass, Task } from "gulpclass/Decorators"
import * as gulp from "gulp"

@Gulpclass()
class Gulp {
    @Task()
    installLocal(cb: Function) {
        let i = 0;
    }
}