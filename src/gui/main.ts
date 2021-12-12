import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@6.4.6/dist/fuse.esm.js';

import { Database, Label, Text } from "../database.js";
import { ValidationError } from "../typecheck.js";
import { localStorageDbKey, localStorageHistoryKey } from "../db-import.js";


const minRandomBrightness = 150;
const debounceTime = 400;

function colorToRgb(arr: number[]): string {
  return `rgb(${arr.join(',')})`;
}

function rand(max: number) { return Math.floor(Math.random() * max); }

function getRandomColor() {
  let [ r, g, b ] = [ 0, 0, 0 ];
  
  while (r + g + b < minRandomBrightness) {
    [ r, g, b ] = [ rand(255), rand(255), rand(255) ];
  }
  
  return [ r, g, b ];
}

const fuseOptions = {
  keys: [ "str" ],
  findAllMatches: true,
  ignoreLocation: true,
  ignoreFieldNorm: true,
};

class Popup {
  static readonly dbError = new Popup("db-error");
  static readonly export = new Popup("export-popup");
  static readonly createEditLabel = new Popup("create-edit-label");
  static readonly createEditText = new Popup("create-edit-text");
  
  constructor(
    public componentName: string,
  ) {}
}

const app = Vue.createApp({
  name: "root",
  template: `
    <div>
      <labels
        :selection="selection"
        :labels="db.labels"
        
        @selection="setSelection"
        @popup="setPopup"
      />
      
      <texts :texts="db.texts" :selected="selectedTexts" @popup="setPopup" />
      
      <div v-if="popup"
        ref="popupTopDiv"
        style="
          position: absolute;
          background-color: rgba(0,0,0,.1);
          width: 100vw;
          height: 100vh;
          padding-left: 10vw;
          padding-right: 10vw;
          padding-top: 10vh;
          padding-bottom: 10vh;
        "
        @click="$event.target === $refs.popupTopDiv && setPopup(null)"
      >
        <div style="background-color: white; height: 100%; border-radius: 7px; padding: 10px;">
          <component
            :is="popup.componentName"
            :db="db"
            :arg="popupArg"
            @popup="setPopup"
          />
        </div>
      </div>
    </div>
  `,
  data() {
    const db = new Database()
    
    return {
      db,
      selection: '',
      popup: null as Popup | null,
      popupArg: null as unknown,
      selectedTexts: db.texts.map(e => e.id),
      cancelSelectionUpdate: NaN,
    };
  },
  watch: {
    "db.error": {
      handler(value: unknown) {
        if (value) {
          this.popupArg = null;
          this.popup = Popup.dbError;
        }
      },
      immediate: true,
    },
    selection() {
      clearTimeout(this.cancelSelectionUpdate);
      
      this.cancelSelectionUpdate = setTimeout(() => this.updateSelectedTexts(), debounceTime);
    },
  },
  methods: {
    setSelection(selection: string) {
      this.selection = selection;
    },
    setPopup(popup: Popup, arg: unknown = null) {
      this.popup = popup;
      this.popupArg = arg;
    },
    updateSelectedTexts(): void {
      if (this.selection === '') return this.db.texts.map(e => e.id);
      
      this.selectedTexts = new Fuse(
        this.db.texts.map(text => text.toSeachObject()),
        fuseOptions,
      ).search(this.selection).map(e => e.item.id);
    },
  },
});

app.config.globalProperties.Popup = Popup;
app.config.globalProperties.console = console;
app.config.globalProperties.colorToRgb = colorToRgb;

app.component("db-error", {
  template: `
    <div style="display: flex; flex-direction: column; height: 100%">
      <div>
        <p class="popup-title">Database error</p>
        <p>{{db.error}}</p>
        
        Current database:
      </div>
      <textarea
        :value="localStorageDb"
        style="display: block; width: 100%; flex-grow: 1; resize: none;"
      />
    </div>
  `,
  props: {
    db: {
      type: Database,
      required: true,
    },
  },
  computed: {
    localStorageDb() {
      return localStorage.getItem(localStorageDbKey);
    },
  },
});

app.component("export-popup", {
  template: `
    <div>
      <p class="popup-title">Export</p>
      
      <p><input type="checkbox" v-model="prettyPrint" /> Pretty print</p>
      
      <p>Database (<a href @click.prevent="writeToClipboard(localStorageDb)">copy</a>):
      <textarea :value="localStorageDb" style="width: 100%; resize: vertical;" /></p>
      
      <p>Database and history (<a href @click.prevent="writeToClipboard(localStorageDbAndHistory)">copy</a>):
      <textarea :value="localStorageDbAndHistory" style="width: 100%; resize: vertical;" /></p>
    </div>
  `,
  props: {
    db: {
      type: Database,
      required: true,
    },
  },
  data() {
    return {
      prettyPrint: true,
    };
  },
  computed: {
    localStorageDb() {
      const obj = JSON.parse(localStorage.getItem(localStorageDbKey)!);
      
      return JSON.stringify(obj, null, this.prettyPrint ? 2 : 0);
    },
    localStorageDbAndHistory() {
      const db = localStorage.getItem(localStorageDbKey);
      const history = localStorage.getItem(localStorageHistoryKey);
      
      const obj = JSON.parse(`{"db":${db},"history":${history}}`);
      
      return JSON.stringify(obj, null, this.prettyPrint ? 2 : 0);
    },
  },
  methods: {
    writeToClipboard(value: string) {
      navigator.clipboard.writeText(value);
    },
  },
});

app.component("create-edit-label", {
  template: `
    <div>
      <p v-if="!labelToEdit" class="popup-title">Create a new label</p>
      <p v-else class="popup-title">Edit label</p>
      
      <p>Name:<br /><input v-model="labelRaw.name" ></p>
      <p>Color:<br /><input v-model="labelColor" :style="{ backgroundColor: colorToRgb(labelRaw.color) }"></p>
      <p>Description:<br />
      <textarea v-model="labelRaw.description" style="width: 100%; resize: vertical;" /></p>
      
      <p>Ancestors:
      <template v-for="(ancestor, index) of labelRaw.ancestors">
        <br /><input
          :ref="index + 2 === labelRaw.ancestors.length ? 'penultimateAncestorInput' : null"
          v-model="labelRaw.ancestors[index]"
        />
      </template></p>
      
      <p><input
        type="button"
        :value="labelToEdit ? 'Edit label' : 'Create label'"
        @click="createEditLabel"
      ></p>
      
      <p v-if="labelToEdit">
        <input type="button" value="Delete label" @click="displayDeletePrompt = true">
        
        <span v-if="displayDeletePrompt">
          Are you sure?
          
          <input type="button" value="Yes" @click="deleteLabel">
          ..
          <input type="button" value="No" @click="displayDeletePrompt = false">
          
        </span>
      </p>
      
      <p v-if="error">{{error}}</p>
    </div>
  `,
  props: {
    db: {
      type: Database,
      required: true,
    },
    arg: {
      type: [ Label, null ],
      required: true,
    },
  },
  data() {
    const labelToEdit = this.arg;
    
    return {
      labelColor: (labelToEdit?.color || getRandomColor()).join(" "),
      labelRaw: {
        name: labelToEdit?.name || "",
        color: [ 0, 0, 0 ],
        description: labelToEdit?.description || "",
        ancestors: labelToEdit ? [ ...labelToEdit.ancestors.map(a => a.name), "" ] : [ "" ],
      },
      displayDeletePrompt: false,
      error: null as ValidationError | null,
    };
  },
  computed: {
    labelToEdit(): Label | null { return this.arg; },
  },
  watch: {
    labelColor: {
      handler(value: string) {
        const color = value.split(" ").map(str => +str);
        
        for (const [ i, c ] of color.entries()) {
          (0 <= c && c < 256) || (color[i] = 255);
        }
        
        while (color.length < 3) color.push(255);
        
        if (3 < color.length) color.length = 3;
        
        this.labelRaw.color = color;
      },
      immediate: true,
    },
    "labelRaw.ancestors": {
      handler(value: string[]) {
        // TODO this code is shared with create-edit-text, should be refactored.
        const ancestors = value.filter((a, i) => a !== "" || i + 1 === value.length);
        
        const removedElements = ancestors.length !== value.length;
        const lastNotEmpty = ancestors[ancestors.length - 1] !== "";
        
        lastNotEmpty && ancestors.push("");
        
        if (removedElements || lastNotEmpty) this.labelRaw.ancestors = ancestors;
        
        removedElements && this.$refs.penultimateAncestorInput.focus();
      },
      deep: true,
    },
  },
  methods: {
    createEditLabel() {
      this.labelRaw.ancestors.pop()
      
      const maybeError = this.db.createEditLabel(this.labelRaw, this.labelToEdit);
      
      if (maybeError) {
        this.error = maybeError;
        this.labelRaw.ancestors.push("");
      } else {
        this.$emit('popup', null);
      }
    },
    deleteLabel() {
      this.db.deleteLabel(this.labelToEdit.name);
      
      this.$emit('popup', null);
    },
  },
});

app.component("create-edit-text", {
  template: `
    <div style="height: 100%">
      <p v-if="!textToEdit" class="popup-title">Create a new note</p>
      <p v-else class="popup-title">Edit note</p>
      
      <textarea v-model="textRaw.text" style="width: 100%; height: 50%; resize: vertical;" />
      <p>Labels:<br />
      <input
        v-for="(ancestor, index) of textRaw.labels"
        v-model="textRaw.labels[index]"
        :ref="index + 2 === textRaw.labels.length ? 'penultimateLabelInput' : null"
      />
      </p>
      
      <p><input type="button" value="Fill in ancestor labels" @click="fillInLabels" /></p>
      
      <p><input
        type="button"
        :value="textToEdit ? 'Edit note' : 'Create note'"
        @click="createEditNote"
      ></p>
      
      <p v-if="error">{{error}}</p>
    </div>
  `,
  data() {
    const textToEdit = this.arg;
    
    return {
      textRaw: {
        date: textToEdit?.date || new Date().toJSON(),
        text: textToEdit?.text || "",
        labels: textToEdit ? [ ...textToEdit.labels.map(l => l.name), "" ] : [ "" ],
      },
      error: null as ValidationError | null,
    };
  },
  props: {
    db: {
      type: Database,
      required: true,
    },
    arg: {
      type: [ Text, null ],
      required: true,
    },
  },
  computed: {
    textToEdit(): Text | null {
      return this.arg;
    },
  },
  watch: {
    "textRaw.labels": {
      handler(value: string[]) {
        const labels = value.filter((a, i) => a !== "" || i + 1 === value.length);
        
        const removedElements = labels.length !== value.length;
        const lastNotEmpty = labels[labels.length - 1] !== "";
        
        lastNotEmpty && labels.push("");
        
        if (removedElements || lastNotEmpty) this.textRaw.labels = labels;
        
        removedElements && this.$refs.penultimateLabelInput.focus();
      },
      deep: true,
    },
  },
  methods: {
    createEditNote() {
      this.textToEdit || (this.textRaw.date = new Date().toJSON());
      this.textRaw.labels.pop();
      
      const maybeError = this.db.createEditText(this.textRaw, this.textToEdit);
      
      if (maybeError) {
        this.textRaw.labels.push("");
        this.error = maybeError;
      } else {
        this.$emit('popup', null);
      }
    },
    fillInLabels() {
      const labelsToAdd: string[] = [];
      const currentLabelNames = this.textRaw.labels.filter(l => l);
      
      for (const labelName of currentLabelNames) {
        const label = this.db.labels.get(labelName);
        
        label && label.ancestors.forEach(ancestor => labelsToAdd.push(ancestor.name));
      }
      
      const expandedLabelNames = [ ...new Set([ ...this.textRaw.labels, ...labelsToAdd ]) ];
      
      currentLabelNames.length < expandedLabelNames.length
        && (this.textRaw.labels = [ ...expandedLabelNames, "" ]);
    },
  },
});

app.component("labels", {
  template: `
    <div style="float: left; height: 100vh; width: 20%; background-color: lightGray;">
      <input
        style="margin: 7px; width: calc(100% - 14px); height: 35px;"
        :value="selection"
        @input="$emit('selection', $event.target.value)"
      >
      
      <input
        type="button"
        style="margin: 0 7px; height: 35px"
        value="Create label"
        @click="$emit('popup', Popup.createEditLabel, null)"
      >
      
      <input
        type="button"
        style="margin: 0 7px; height: 35px"
        value="Create note"
        @click="$emit('popup', Popup.createEditText, null)"
      >
      
      <input
        type="button"
        style="margin: 0 7px; height: 35px"
        value="Export"
        @click="$emit('popup', Popup.export)"
      >
      
      <div style="height: calc(100% - 84px); overflow-y: scroll;">
        <dag-label v-for="label of labels.values()" :label="label" @popup="setPopup" />
      </div>
      
      <p v-if="!labels.size" style="margin: 7px;">(No labels exist.)</p>
    </div>
  `,
  props: {
    labels: {
      type: Map as new() => Map<string, Label>,
      required: true,
    },
    selection: {
      type: String,
      required: true,
    },
  },
  methods: {
    setPopup(value: Popup, arg: unknown = null) {
      this.$emit('popup', value, arg);
    },
  },
});

app.component("dag-label", {
  template: `
    <div style="margin: 7px 7px 0 7px;">
      <div
        :style="{
          backgroundColor: colorToRgb(label.color),
          display: 'inline-block',
          padding: '5px 7px 5px 7px',
          borderRadius: '3px',
          userSelect: 'none',
        }"
        @click="$emit('popup', Popup.createEditLabel, label)"
      >
        {{label.name}}
      </div>
    </div>
  `,
  props: {
    label: {
      type: Label,
      required: true,
    },
  },
});

app.component("texts", {
  template: `
    <div
      style="
        float: left;
        width: 80%;
        height: 100vh;
        overflow-y: scroll;
        background-color: whiteSmoke;
        padding-top: 7px;
      "
    >
      <text-card v-for="text of sortedTexts" :text="text" @popup="setPopup" />
      
      <p v-if="!texts.length" style="margin: 7px;">(No notes exist.)</p>
    </div>
  `,
  props: {
    texts: {
      type: Array as new() => Text[],
      required: true,
    },
    selected: {
      type: Array as new() => number[],
      required: true,
    },
  },
  computed: {
    sortedTexts() {
      const texts = [];
      
      for (const id of this.selected) {
        texts.push(this.texts[id]);
      }
      
      return texts;
    },
  },
  methods: {
    setPopup(popup: Popup, arg: unknown = null) {
      this.$emit('popup', popup, arg);
    },
  },
});

app.component("text-card", {
  template: `
    <div style="margin: 0 7px 7px 7px; background-color: white; border-radius: 3px; padding: 7px;">
      {{text.text}}
      
      <div style="padding-bottom: 7px">
        <dag-label
          v-for="label of text.labels"
          :label="label" style="float: left;"
          @popup="setPopup"
        />
        
        <input
          type="button"
          value="Edit"
          style="height: 20px; margin: 11px;"
          @click="setPopup(Popup.createEditText, text)"
        />
        
        <div style="clear: both;"></div>
      </div>
      
      {{text.date}}
    </div>
  `,
  props: {
    text: {
      type: Text,
      required: true,
    },
  },
  methods: {
    setPopup(popup: Popup, arg: unknown = null) {
      this.$emit('popup', popup, arg);
    },
  },
});

app.mount("#root");
