<template>
  <div>
    <div>{{ item.displayName }} (reports to {{ item.managerName }})</div>
    <div v-if="item.week_ending">
      Sunday {{ weekStart | shortDate }} to Saturday
      {{ item.week_ending.toDate() | shortDate }}
    </div>
    <table>
      <thead>
        <tr>
          <th rowspan="2">job/proposal</th>
          <th rowspan="2">time type</th>
          <th rowspan="2">date</th>
          <th colspan="3">hours</th>
          <th rowspan="2">work record</th>
          <th rowspan="2">project</th>
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
          <td>{{ entry.project }}</td>
          <td>{{ entry.timetype }}</td>
          <td>
            {{ entry.date.toDate() | shortDate }}
          </td>
          <td>{{ entry.jobHours }}</td>
          <td>{{ entry.hours }}</td>
          <td>{{ entry.mealsHours }}</td>
          <td>{{ entry.workrecord }}</td>
          <td>{{ entry.projectName }}</td>
          <td>{{ entry.notes }}</td>
        </tr>
      </tbody>
      <tfoot v-if="item.workHoursTally !== undefined">
        <tr>
          <td colspan="3">Totals</td>
          <td>{{ item.workHoursTally.jobHours }}</td>
          <td>{{ item.workHoursTally.hours }}</td>
          <td>{{ item.workHoursTally.mealsHours }}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<script>
import { format, subWeeks, addMilliseconds } from "date-fns";

export default {
  props: ["id"],
  computed: {
    weekStart() {
      if (this.item.week_ending !== undefined) {
        return addMilliseconds(subWeeks(this.item.week_ending.toDate(), 1), 1);
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
  },
  methods: {
    hours(item) {
      const hours = [];
      if ("hours" in item) hours.push(`${item.hours} hours`);
      if ("jobHours" in item) hours.push(`${item.jobHours} job hours`);
      if ("mealsHours" in item) hours.push(`${item.mealsHours} hours meals`);
      return hours.join(", ");
    }
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
