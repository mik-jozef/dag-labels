import { RArray, RObject, RString, ValidationError, Validator, RNumber } from "./typecheck.js";
import { Database, Label, Text } from "./database.js";


export const localStorageDbKey = "database";
export const localStorageHistoryKey = "history";
export const localStorageSHC = "saveHistoryCounter";

const saveHistoryEvery = 15;

const maxHistory = 80;

const validator = new Validator({
  database: new RObject({
    labels: new RArray(new RObject({
      name: new RString(),
      color: new RArray(
        new RNumber(
          n => n % 1 === 0 && 0 <= n && n < 256 ? null : "a number between 0 and 256",
        ),
      ),
      description: new RString(),
      ancestors: new RArray(new RString()),
    })),
    texts: new RArray(new RObject({
      id: new RNumber(),
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

export type DatabaseRaw = ReturnType<typeof uselessDoNotCall>;

export function importBareLabels(db: Database, raw: DatabaseRaw) {
  for (const [ index, rawLabel ] of raw.labels.entries()) {
    if (db.labels.has(rawLabel.name)) {
      db.error = new ValidationError(
        [ "labels", index ],
        "a unique label name",
        rawLabel.name,
      );
      
      return;
    }
    
    db.labels.set(rawLabel.name, new Label(rawLabel.name, rawLabel.color, rawLabel.description, []));
  }
}

export function importLabelAncestors(db: Database, raw: DatabaseRaw) {
  for (const [ lIndex, rawLabel ] of raw.labels.entries()) {
    const label = db.labels.get(rawLabel.name)!;
    
    for (const [ pIndex, ancestorName ] of rawLabel.ancestors.entries()) {
      const ancestor = db.labels.get(ancestorName);
      
      if (!ancestor) {
        db.error = new ValidationError(
          [ "labels", lIndex, pIndex ],
          "an existing label",
          ancestorName,
        );
        
        return;
      }
      
      if (label.ancestors.includes(ancestor)) {
        db.error = new ValidationError(
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

export function visitLabels(db: Database, label: Label, depth = db.labels.size) {
  if (depth === 0) {
    db.error = new ValidationError(
      [ "labels" ],
      "an acyclic graph of ancestors",
      "a cycle containing the label \"" + label.name + "\""
    );
    
    return;
  }
  
  for (const ancestor of label.ancestors) {
    visitLabels(db, ancestor, depth - 1);
  }
}

export function validateLabelCycles(db: Database) {
  for (const [ _, label ] of db.labels) {
    visitLabels(db, label);
    
    if (db.error) return;
  }
}

export function validateLabelTransitivity(db: Database) {
  for (const [ _, label ] of db.labels) {
    for (const ancestor of label.ancestors) {
      for (const grandAncestor of ancestor.ancestors) {
        if (!label.ancestors.includes(grandAncestor)) {
          db.error = new ValidationError(
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

export function importTexts(db: Database, raw: DatabaseRaw) {
  for (const [ tIndex, rawText ] of raw.texts.entries()) {
    for (const [ lIndex, labelName ] of rawText.labels.entries()) {
      if (!db.labels.has(labelName)) {
        db.error = new ValidationError(
          [ "texts", tIndex, "labels", lIndex ],
          "an existing label",
          labelName
        );
        
        return;
      }
      
      for (const ancestorLabel of db.labels.get(labelName)!.ancestors) {
        if (!rawText.labels.includes(ancestorLabel.name)) {
          db.error = new ValidationError(
            [ "texts", tIndex, "labels", lIndex ],
            "ancestor labels to be present",
            '"' + labelName + '" without its ancestor "' + ancestorLabel.name + '"',
          );
        }
      }
    }
    
    db.texts.push(
      new Text(
        rawText.id,
        rawText.text,
        new Date(rawText.date),
        rawText.labels.map(labelName => db.labels.get(labelName)!),
      ),
    );
    
  }
}

export function loadDatabase(db: Database) {
  const state = localStorage.getItem(localStorageDbKey);
  
  if (state === null) {
    localStorage.setItem(localStorageDbKey, JSON.stringify(db.toRaw()));
    localStorage.setItem(localStorageHistoryKey, "[]");
    
    return;
  }
  
  let raw;
  
  try {
    raw = validator.validate(JSON.parse(state), 'database');
  } catch (e) {
    db.error = e;
    
    return;
  }
  
  if (raw instanceof ValidationError) {
    db.error = raw;
    
    return;
  }
  
  db.error || importBareLabels(db, raw);
  db.error || importLabelAncestors(db, raw);
  db.error || validateLabelCycles(db);
  db.error || validateLabelTransitivity(db);
  
  db.error || importTexts(db, raw);
}

function getDbAndHistory(): { history: any[], lastSaved: any } {
  return {
    history: JSON.parse(localStorage.getItem(localStorageHistoryKey)!),
    lastSaved: JSON.parse(localStorage.getItem(localStorageDbKey)!),
  };
}

function getSaveHistoryCounter() {
  localStorage.getItem(localStorageSHC) === null && localStorage.setItem(localStorageSHC, '0');
  
  return +localStorage.getItem(localStorageSHC)!;
};

function incSaveHistoryCounter() {
  localStorage.setItem(localStorageSHC, '' + (getSaveHistoryCounter() + 1));
}

function resetSaveHistoryCounter() {
  localStorage.setItem(localStorageSHC, '0');
}

export function saveDatabaseRaw(dbRaw: DatabaseRaw) {
  const { history, lastSaved } = getDbAndHistory();
  
  if (getSaveHistoryCounter() < saveHistoryEvery) {
    incSaveHistoryCounter();
    history[0] = lastSaved;
  } else {
    resetSaveHistoryCounter();
    history.unshift(lastSaved);
    maxHistory < history.length && (history.length = maxHistory);
  }
  
  localStorage.setItem(localStorageHistoryKey, JSON.stringify(history));
  localStorage.setItem(localStorageDbKey, JSON.stringify(dbRaw));
}

(window as any).editDatabase =
function editDatabase(editDb: (db: DatabaseRaw, history: DatabaseRaw[]) => DatabaseRaw) {
  const { history, lastSaved } = getDbAndHistory();
  
  saveDatabaseRaw(editDb(lastSaved, history));
}
