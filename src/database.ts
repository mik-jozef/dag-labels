import { RArray, RObject, RString, ValidationError, Validator } from "./typecheck";

const validator = new Validator({
  database: new RObject({
    labels: new RArray(new RObject({
      name: new RString(),
      description: new RString(),
      ancestors: new RArray(new RString()),
    })),
    texts: new RArray(new RObject({
      text: new RString(),
      date: new RString(date => new Date(date).toJSON() === date ? null : "a `Date.toJSON()` date"),
      labels: new RArray(new RString()),
    })),
  }),
});

function uselessDoNotCall() {
  const validated = validator.validate(null, 'database');
  
  return validated instanceof ValidationError ? null as never : validated;
};

type DatabaseRaw = ReturnType<typeof uselessDoNotCall>;

class Label {
  constructor(
    public name: string,
    public description: string,
    public ancestors: Label[],
  ) {}
  
  toRaw() {
    return {
      name: this.name,
      description: this.description,
      ancestors: this.ancestors.map(label => label.name),
    };
  }
}

class Text {
  constructor(
    public text: string,
    public date: Date,
    public labels: Label[],
  ) {}
  
  toRaw() {
    return {
      text: this.text,
      date: this.date.toJSON(),
      labels: this.labels.map(label => label.name),
    };
  }
}

class Database {
  labels = new Map<string, Label>();
  texts: Text[] = [];
  
  error: ValidationError | null = null;
  
  importBareLabels(raw: DatabaseRaw) {
    for (const [ index, rawLabel ] of raw.labels.entries()) {
      if (this.labels.has(rawLabel.name)) {
        this.error = new ValidationError(
          [ "labels", index ],
          "a unique label name",
          rawLabel.name,
        );
        
        return;
      }
      
      this.labels.set(rawLabel.name, new Label(rawLabel.name, rawLabel.description, []));
    }
  }
  
  importLabelAncestors(raw: DatabaseRaw) {
    for (const [ lIndex, rawLabel ] of raw.labels.entries()) {
      const label = this.labels.get(rawLabel.name)!;
      
      for (const [ pIndex, ancestorName ] of rawLabel.ancestors.entries()) {
        const ancestor = this.labels.get(ancestorName);
        
        if (!ancestor) {
          this.error = new ValidationError(
            [ "labels", lIndex, pIndex ],
            "an existing label",
            ancestorName,
          );
          
          return;
        }
        
        if (label.ancestors.includes(ancestor)) {
          this.error = new ValidationError(
            [ "labels", lIndex, "ancestors", pIndex ],
            "a unique ancestor",
            ancestor.name,
          );
          
          return;
        }
        
        label.ancestors.push(ancestor);
      }
    }
  }
  
  visitLabels(label: Label, depth = this.labels.size) {
    if (depth === 0) {
      this.error = new ValidationError(
        [ "labels" ],
        "an acyclic graph of ancestors",
        "a cycle containing the label \"" + label.name + "\""
      );
      
      return;
    }
    
    for (const ancestor of label.ancestors) {
      this.visitLabels(ancestor, depth - 1);
    }
  }
  
  validateLabelCycles() {
    for (const [ _, label ] of this.labels) {
      this.visitLabels(label);
      
      if (this.error) return;
    }
  }
  
  validateLabelTransitivity() {
    for (const [ _, label ] of this.labels) {
      for (const ancestor of label.ancestors) {
        for (const grandAncestor of ancestor.ancestors) {
          if (!label.ancestors.includes(grandAncestor)) {
            this.error = new ValidationError(
              [ "labels" ],
              "transitive ancestorship",
              `label "${label.name}" without ancestor "${grandAncestor.name}" (related through "${ancestor.name}")`,
            );
            
            return;
          }
        }
      }
    }
  }
  
  importTexts(raw: DatabaseRaw) {
    for (const [ tIndex, rawText ] of raw.texts.entries()) {
      for (const [ lIndex, labelName ] of rawText.labels.entries()) {
        if (!this.labels.has(labelName)) {
          this.error = new ValidationError(
            [ "texts", tIndex, "labels", lIndex ],
            "an existing label",
            labelName
          );
          
          return;
        }
      }
      
      this.texts.push(
        new Text(
          rawText.text,
          new Date(rawText.date),
          rawText.labels.map(labelName =>this.labels.get(labelName)!),
        ),
      );
      
    }
  }
  
  constructor(
    unvalidated: unknown,
  ) {
    const raw = validator.validate(unvalidated, 'database');
    
    if (raw instanceof ValidationError) {
      this.error = raw;
      
      return;
    }
    
    this.error || this.importBareLabels(raw);
    this.error || this.importLabelAncestors(raw);
    this.error || this.validateLabelCycles();
    this.error || this.validateLabelTransitivity();
    
    this.error || this.importTexts(raw);
    
    // TODO texts.
  }
  
  toRaw(): DatabaseRaw {
    return {
      labels: [ ...this.labels.values() ].map(label => label.toRaw()),
      texts: this.texts.map(text => text.toRaw()),
    };
  }
}
