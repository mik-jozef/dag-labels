
type BasicType =
  | "array"
  | "boolean"
  | "null"
  | "number"
  | "object"
  | "string"
  | "undefined"
;

function getBasicType(value: unknown): BasicType {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  
  const t = typeof value;
  
  if (t === "bigint"
    || t === "function"
    || t === "symbol"
    || t === "undefined"
  ) throw new Error("We're supposed to validate JSON.");
  
  return t;
}

export class ValidationError {
  constructor(
    public path: (string | number)[] | null,
    public expected: string,
    public got: unknown,
  ) {}
  
  shift(prop: string | number) {
    if (this.path === null) throw new Error(`Cannot unshift null with "${prop}".`);
    
    this.path.unshift(prop);
    
    return this;
  }
  
  toString() {
    let strStart = this.path
      ? "In " + this.path.join(".") + ", expected "
      : "Expected ";
    
    return strStart + this.expected + ", but got " + this.got + ".";
  }
}

abstract class ValidatorCase {
  abstract fuckStructuralTypingOfClasses: string;
  
  abstract validate(value: unknown): ValidationError | null;
}

function dummyValidator() {
  return null;
}

export class RBoolean extends ValidatorCase {
  fuckStructuralTypingOfClasses: "RBoolean" = "RBoolean";
  
  validate(value: unknown): ValidationError | null {
    return typeof value === "boolean"
      ? null
      : new ValidationError([], "boolean", value)
    ;
  }
}

export class RNull extends ValidatorCase {
  fuckStructuralTypingOfClasses: "RNull" = "RNull";
  
  validate(value: unknown): ValidationError | null {
    return value === null
      ? null
      : new ValidationError([], "null", value)
    ;
  }
}

export class RNumber extends ValidatorCase {
  fuckStructuralTypingOfClasses: "RNumber" = "RNumber";
  
  constructor(
    public customValidate: (value: number) => string | null = dummyValidator,
  ) {
    super();
  }
  
  validate(value: unknown): ValidationError | null {
    if (typeof value !== "number") return new ValidationError([], "number", value);
    
    const customError = this.customValidate(value);
    
    return customError !== null
      ? new ValidationError([], customError, value)
      : null
    ;
  }
}

export class RString extends ValidatorCase {
  fuckStructuralTypingOfClasses: "RString" = "RString";
  
  constructor(
    public customValidate: (value: string) => string | null = dummyValidator,
  ) {
    super();
  }
  
  validate(value: unknown): ValidationError | null {
    if (typeof value !== "string") return new ValidationError([], "string", value);
    
    const customError = this.customValidate(value);
    
    return customError !== null
      ? new ValidationError([], customError, value)
      : null
    ;
  }
}

export class RObject<
  Shape extends Record<string, ValidatorCase>,
> extends ValidatorCase {
  fuckStructuralTypingOfClasses: "RObject" = "RObject";
  
  constructor(
    public shape: Shape,
  ) {
    super();
  }
  
  validate(value: unknown): ValidationError | null {
    const basicType = getBasicType(value);
    
    if (basicType !== "object") return new ValidationError([], "object", basicType);
    
    const obj = value as Record<string, any>;
    
    for (const prop of Object.keys(obj)) {
      if (!(prop in this.shape)) {
        return new ValidationError([ prop ], "undefined", getBasicType(obj[prop]));
      }
    }
    
    for (const prop of Object.keys(this.shape)) {
      const validator = this.shape[prop];
      const validated = validator.validate(obj[prop]);
      
      if (validated instanceof ValidationError) {
        return validated.shift(prop);
      }
    }
    
    return null;
  }
}

export class RArray<
  Of extends ValidatorCase,
> extends ValidatorCase {
  fuckStructuralTypingOfClasses: "RArray" = "RArray";
  
  constructor(
    public of: Of,
  ) {
    super();
  }
  
  validate(value: unknown): ValidationError | null {
    const basicType = getBasicType(value);
    
    if (basicType !== "array") return new ValidationError([], "array", basicType);
    
    const arr = value as any[];
    
    for (const [ index, element ] of arr.entries()) {
      const validated = this.of.validate(element);
      
      if (validated instanceof ValidationError) {
        return validated.shift(index);
      }
    }
    
    return null;
  }

}

export class Validator<Types extends Record<string, ValidatorCase>> {
  constructor(
    public types: Types,
  ) {}
  
  validate<As extends keyof Types>(value: unknown, as: As): ValidatorCaseToType<Types[As], Types> | ValidationError {
    const validated = this.types[as].validate(value);
    
    return validated instanceof ValidationError ? validated : (value as any);
  }
}

export type ValidatorCaseToType<
  VC extends ValidatorCase | keyof Types,
  Types extends Record<string, ValidatorCase>,
> =
  VC extends keyof Types ? /* ValidatorCaseToType<Types[VC], Types> */ unknown :
  VC extends RBoolean ? boolean :
  VC extends RNull ? null :
  VC extends RNumber ? number :
  VC extends RString ? string :
  VC extends RObject<infer Shape> ? { [key in keyof Shape]: ValidatorCaseToType<Shape[key], Types> } :
  VC extends RArray<infer Of> ? ValidatorCaseToType<Of, Types>[] :
  never
;
