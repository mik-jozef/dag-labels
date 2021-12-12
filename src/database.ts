import { ValidationError } from "./typecheck.js";
import { DatabaseRaw, loadDatabase, saveDatabaseRaw } from "./db-import.js";


export type LabelRaw = DatabaseRaw['labels'] extends (infer Label)[] ? Label : never;
export class Label {
  color: [ number, number, number ]
  
  constructor(
    public name: string,
    color: number[],
    public description: string,
    public ancestors: Label[],
  ) {
    if (color.length !== 3) throw new Error('Wrong label color.');
    
    this.color = color as [ number, number, number ];
  }
  
  toRaw(): LabelRaw {
    return {
      name: this.name,
      color: this.color,
      description: this.description,
      ancestors: this.ancestors.map(label => label.name),
    };
  }
}

export type TextRaw = DatabaseRaw['texts'] extends (infer Text)[] ? Text : never;
export class Text {
  constructor(
    public id: number,
    public text: string,
    public date: Date,
    public labels: Label[],
  ) {}
  
  toRaw(): TextRaw {
    return {
      id: this.id,
      text: this.text,
      date: this.date.toJSON(),
      labels: this.labels.map(label => label.name),
    };
  }
  
  toSeachObject() {
    return {
      id: this.id,
      str: this.text + " " + this.date + " " + this.labels.map(l => l.name).join(" "),
    };
  }
}

export class Database {
  labels = new Map<string, Label>();
  texts: Text[] = [];
  
  error: ValidationError | null = null;
  
  constructor() {
    loadDatabase(this);
  }
  
  toRaw(): DatabaseRaw {
    return {
      labels: [ ...this.labels.values() ].map(label => label.toRaw()),
      texts: this.texts.map(text => text.toRaw()),
    };
  }
  
  save() {
    saveDatabaseRaw(this.toRaw());
  }
  
  validateLabel(labelRaw: LabelRaw, labelToEdit: Label | null): ValidationError | null {
    if (this.labels.has(labelRaw.name)
      && (labelToEdit === null || labelToEdit.name !== labelRaw.name)) {
        return new ValidationError(null, "a unique name", labelRaw.name);
      }
    
    for (const ancestor of labelRaw.ancestors) {
      if (!this.labels.has(ancestor)) {
        return new ValidationError(null, "that every parent label exists", ancestor);
      }
    }
    
    return null;
  }
  
  createEditLabel(labelRaw: Readonly<LabelRaw>, labelToEdit: Readonly<Label | null>) {
    const maybeError = this.validateLabel(labelRaw, labelToEdit);
    
    if (maybeError) return maybeError;
    
    const ancestors = labelRaw.ancestors.map(a => this.labels.get(a)!);
    
    for (const ancestor of ancestors) {
      for (const greatAncestor of ancestor.ancestors) {
        ancestors.includes(greatAncestor) || ancestors.push(greatAncestor);
      }
    }
    
    if (labelToEdit) {
      const label = this.labels.get(labelToEdit.name)!;
      
      const origName = label.name;
      
      label.name = labelRaw.name;
      label.color = [ ...labelRaw.color ] as [ number, number, number ];
      label.description = labelRaw.description;
      label.ancestors = ancestors;
      
      if (origName !== label.name) {
        this.labels.delete(origName);
        this.labels.set(label.name, label);
      }
      
      for (const anyLabel of this.labels.values()) {
        if (anyLabel.ancestors.includes(label)) {
          anyLabel.ancestors = [ ...new Set([ ...anyLabel.ancestors, ...label.ancestors ]) ];
        }
      }
      
      for (const anyText of this.texts.values()) {
        if (anyText.labels.includes(label)) {
          anyText.labels = [ ...new Set([ ...anyText.labels, ...label.ancestors ]) ];
        }
      }
    } else {
      this.labels.set(
        labelRaw.name,
        new Label(
          labelRaw.name,
          [ ...labelRaw.color ],
          labelRaw.description,
          ancestors,
        ),
      );
    }
    
    this.save();
  }
  
  deleteLabel(name: string) {
    for (const text of this.texts) {
      text.labels = text.labels.filter(l => l.name !== name);
    }
    
    for (const [ _, label ] of this.labels) {
      label.ancestors = label.ancestors.filter(l => l.name !== name);
    }
    
    this.labels.delete(name);
    
    this.save();
  }
  
  validateText(textRaw: Readonly<TextRaw>): ValidationError | null {
    for (const label of textRaw.labels) {
      if (!this.labels.has(label)) {
        return new ValidationError(null, "that every parent label exists", label);
      }
    }
    
    return null;
  }
  
  createEditText(textRaw: TextRaw, textToEdit: Readonly<Text | null>) {
    const maybeError = this.validateText(textRaw);
    
    if (maybeError) return maybeError;
    
    const labels = textRaw.labels.map(l => this.labels.get(l)!);
    
    for (const labelName of textRaw.labels) {
      for (const ancestor of this.labels.get(labelName)!.ancestors) {
        labels.includes(ancestor) || labels.push(ancestor);
      }
    }
    
    if (textToEdit) {
      const text = this.texts[textToEdit.id];
      
      text.text = textRaw.text;
      text.labels = labels;
    } else {
      this.texts.push(new Text(this.texts.length, textRaw.text, new Date(textRaw.date), labels));
    }
    
    this.save();
  }
}
