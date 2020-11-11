<template>
  <div>
    <div>{{ item.displayName }} (reports to {{ item.managerName }})</div>
    <div v-if="item.weekEnding">
      Sunday {{ weekStart | shortDate }} to Saturday
      {{ item.weekEnding.toDate() | shortDate }}
    </div>
    <table>
      <thead>
        <tr>
          <th rowspan="2">job/proposal</th>
          <th rowspan="2">time type</th>
          <th rowspan="2">date</th>
          <th colspan="3">hours</th>
          <th rowspan="2">work record</th>
          <th rowspan="2">job</th>
          <th rowspan="2">notes</th>
        </tr>
        <tr>
          <th>job</th>
          <th>non</th>
          <th>meals</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(entry, index) in item.entries" v-bind:key="index">
          <td>{{ entry.job }}</td>
          <td>{{ entry.timetype }}</td>
          <td>
            {{ entry.date.toDate() | shortDate }}
          </td>
          <td>{{ entry.jobHours }}</td>
          <td>{{ entry.hours }}</td>
          <td>{{ entry.mealsHours }}</td>
          <td>{{ entry.workrecord }}</td>
          <td>{{ entry.jobName }}</td>
          <td>{{ entry.notes }}</td>
        </tr>
      </tbody>
      <tfoot v-if="item.workHoursTally !== undefined">
        <tr>
          <td colspan="3">Totals</td>
          <td>{{ item.workHoursTally.jobHours }}</td>
          <td>{{ item.workHoursTally.hours + offHoursSum }}</td>
          <td>{{ item.mealsHoursTally }}</td>
        </tr>
      </tfoot>
    </table>
    <div>
      <h2>Actions</h2>
      <button>approve</button> <!-- if tapr claim and submitted true -->
      <button>submit</button> <!-- if submitted false and uid matches logged in user-->
      <button>reject</button> <!-- if tapr claim and submitted true -->
    </div>
  </div>
</template>

<script>
import { format, subWeeks, addMilliseconds } from "date-fns";

export default {
  props: ["id"],
  computed: {
    offHoursSum() {
      let total = 0;
      for (const code in this.item.nonWorkHoursTally) {
        total += this.item.nonWorkHoursTally[code];
      }
      return total;
    },
    weekStart() {
      if (this.item.weekEnding !== undefined) {
        return addMilliseconds(subWeeks(this.item.weekEnding.toDate(), 1), 1);
      } else {
        return new Date();
      }
    }
  },
  data() {
    return {
      parentPath: null,
      collection: null,
      item: {}
    };
  },
  filters: {
    shortDate(date) {
      return format(date, "MMM dd");
    }
  },
  watch: {
    id: {
      immediate: true,
      handler(id) {
        this.$parent.collection
          .doc(id)
          .get()
          .then(snap => {
            this.item = snap.data();
          });
      }
    }
  },
  created() {
    const currentRoute = this.$route.matched[this.$route.matched.length - 1];
    this.parentPath = currentRoute.parent.path;
    this.collection = this.$parent.collection;
  }
};
</script>
<style scoped>
th,
td,
tr {
  text-align: center;
  background-color: lightgray;
}
.anchorbox {
  flex-basis: 6.5em;
}
</style>
