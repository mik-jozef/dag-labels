const app = Vue.createApp({
  name: "root",
  template: `
    <div>
      <labels />
      <texts />
    </div>
  `,
});

app.component("labels", {
  template: `
    <div style="float: left; min-height: 100vh; width: 20%;">
      TODO labels
    </div>
  `,
})

app.component("texts", {
  template: `
    <div style="float: left; min-height: 100vh; width: 80%;">
      <div style="height: calc(100vh - 40px);">
        TODO display texts
      </div>
      
      <div style="height: 40px;">
        TODO text control
      </div>
    </div>
  `,
});

app.component("text-control", {
  template: `
  `,
});

app.mount("#root");
