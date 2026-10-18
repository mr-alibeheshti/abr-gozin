// Run against the real app; the query combines Persian intent and manual filters.
pm.test("Search succeeds with the local semantic model ready", () => {
  pm.response.to.have.status(200);
  pm.expect(pm.response.json().model.state).to.equal("ready");
});
const result = pm.response.json();
pm.test("Manual RAM and budget override text-derived values", () => {
  pm.expect(result.filters.ram).to.equal(4);
  pm.expect(result.filters.maxPrice).to.equal(3000000);
});
pm.test(
  "Results are nonempty and enforce service, region, RAM and budget",
  () => {
    pm.expect(result.groups.length).to.be.above(0);
    for (const group of result.groups) {
      pm.expect(group.type).to.equal("vps");
      pm.expect(group.region).to.equal("ir");
      pm.expect(group.ram).to.be.at.least(4);
      for (const offer of group.offers) {
        pm.expect(["liara", "arvan"]).to.include(offer.providerId);
        pm.expect(offer.estimate.total).to.be.at.most(3000000);
      }
    }
  },
);
pm.test("Configurations rank by RAM proximity then minimum price", () => {
  for (let i = 1; i < result.groups.length; i++) {
    const previous = result.groups[i - 1],
      current = result.groups[i];
    pm.expect(current.ram).to.be.at.least(previous.ram);
    if (current.ram === previous.ram)
      pm.expect(current.min).to.be.at.least(previous.min);
  }
});
pm.test("No undersized alternatives are returned", () => {
  pm.expect(result.similarGroups).to.deep.equal([]);
  pm.expect(result.filters.resourceMode).to.equal("minimum");
});
