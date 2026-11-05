<script setup lang="ts">
defineProps<{ columns: { key: string; label: string }[]; rows: Record<string, unknown>[]; caption: string }>();
</script>
<template>
  <div class="table-wrap">
    <table>
      <caption
        class="muted"
        style="text-align: left"
      >
        {{ caption }}
      </caption><thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            scope="col"
          >
            {{ column.label }}
          </th>
        </tr>
      </thead><tbody>
        <tr
          v-for="(row, index) in rows"
          :key="String(row.id ?? index)"
        >
          <td
            v-for="column in columns"
            :key="column.key"
          >
            <slot
              :name="column.key"
              :row="row"
            >
              {{ row[column.key] }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
