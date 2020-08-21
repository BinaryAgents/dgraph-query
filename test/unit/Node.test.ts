import { Node } from "../../src";

test("Node should create an id", () => {
  expect(new Node().id).toBeTruthy();
  expect(new Node("green beans").id).toBe("green beans");
});

test("Node should set all values and all values should chain", () => {
  const node = new Node();

  expect(node.addFields(["flavor", "texture", "color"])).toStrictEqual(node);
  expect(node.fields).toStrictEqual(["flavor", "texture", "color"]);

  expect(node.addFields(["flavor", "crunchiness"])).toStrictEqual(node);
  expect(node.fields).toStrictEqual(["flavor", "texture", "color", "crunchiness"]);

  expect(node.removeFields(["texture"])).toStrictEqual(node);
  expect(node.fields).toStrictEqual(["flavor", "color", "crunchiness"]);

  expect(node.addEdge(new Node("bugs"))).toStrictEqual(node);
  expect(node.edges.has("bugs")).toBe(true);

  expect(node.removeEdge("bugs"));
  expect(node.edges.has("bugs")).toBe(false);

  expect(node.setFilters("legitimate list of filters" as any)).toStrictEqual(node);
  expect(node.filters).toBe("legitimate list of filters");

  expect(node.setFilters(null)).toStrictEqual(node);
  expect(node.filters).toBe(null);
});

test("Node should render", () => {
  const noBugsFilter: any = {
    id: "noBugsAllowed",
    render: () => {
      return {
        string: "(keep out you bugs)",
        values: {
          noBugsAllowed: ["insects", "spiders"],
        }
      }
    }
  }
  const node = new Node("tastyVeggies")
    .addEdge(new Node("bugs")
      .setFilters(noBugsFilter)
      .addFields(["uid"]),
    );

  expect(node.render()).toStrictEqual({
    string: "tastyVeggies {\nbugs @filter(keep out you bugs) {\nuid\n}\n}",
    values: {
      noBugsAllowed: ["insects", "spiders"],
    }
  });
});