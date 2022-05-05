import "mocha";
import * as chai from "chai";
const assert = chai.assert;

import { shallowMount, createLocalVue } from "@vue/test-utils";
import mixins from "../src/components/mixins";

import Vuex from "vuex";

const localVue = createLocalVue();
localVue.use(Vuex);

const store = new Vuex.Store({
  state: {
    expenseRates: {
      "2020-01-01": {
        BREAKFAST_RATE: 15,
        LUNCH_RATE: 20,
        DINNER_RATE: 20,
        LODGE_RATE: 50,
        MILEAGE: {
          0: 0.5,
        },
      },
      "2022-05-01": {
        BREAKFAST_RATE: 15,
        LUNCH_RATE: 20,
        DINNER_RATE: 20,
        LODGE_RATE: 50,
        MILEAGE: {
          0: 0.61,
          5000: 0.55,
        },
      },
      "2023-01-01": {
        BREAKFAST_RATE: 15,
        LUNCH_RATE: 20,
        DINNER_RATE: 20,
        LODGE_RATE: 50,
        MILEAGE: {
          0: 0.61,
          500: 0.55,
          1000: 0.5,
          1500: 0.45,
        },
      },
    },
  },
});

describe("mixins", () => {
  it("calculates mileage as expected across times and tiers", () => {
    const wrapper = shallowMount(mixins, { store, localVue });
    const date1 = new Date("2022-04-20");
    const date2 = new Date("2022-05-02");
    const date3 = new Date("2023-05-02");
    let amount = wrapper.vm.calculateMileageAllowance(100, date2, 4950);
    assert.equal(amount, 58, "calculated mileage is wrong");
    amount = wrapper.vm.calculateMileageAllowance(100, date2, 0);
    assert.equal(amount, 61, "calculated mileage is wrong");
    amount = wrapper.vm.calculateMileageAllowance(100, date1, 4950);
    assert.equal(amount, 50, "calculated mileage is wrong");
    amount = wrapper.vm.calculateMileageAllowance(100, date1, 0);
    assert.equal(amount, 50, "calculated mileage is wrong");

    // spans two tiers
    amount = wrapper.vm.calculateMileageAllowance(669, date3, 400);
    assert.equal(amount, 370.5, "calculated mileage is wrong");
  });
});
