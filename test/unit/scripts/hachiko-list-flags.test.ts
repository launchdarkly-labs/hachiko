import { describe, expect, it } from "vitest"
import { filterHachikoFlags } from "../../../src/scripts/hachiko-list-flags.js"

describe("hachiko-list-flags", () => {
  describe("filterHachikoFlags", () => {
    it("should filter flags by prefix", () => {
      const flags = [
        {
          key: "hachiko_prompts_plan1_step1",
          name: "Plan 1 Step 1",
          description: "Test flag 1",
          kind: "boolean",
          on: true,
          variations: [true, false],
        },
        {
          key: "hachiko_prompts_plan2_step1",
          name: "Plan 2 Step 1",
          description: "Test flag 2",
          kind: "boolean",
          on: false,
          variations: [true, false],
        },
        {
          key: "other_flag",
          name: "Other Flag",
          description: "Non-hachiko flag",
          kind: "boolean",
          on: true,
          variations: [true, false],
        },
      ]

      const result = filterHachikoFlags(flags, "hachiko_prompts_")
      expect(result).toHaveLength(2)
      expect(result[0].key).toBe("hachiko_prompts_plan1_step1")
      expect(result[1].key).toBe("hachiko_prompts_plan2_step1")
    })

    it("should return empty array when no flags match", () => {
      const flags = [
        {
          key: "other_flag_1",
          name: "Other Flag 1",
          description: "Non-hachiko flag",
          kind: "boolean",
          on: true,
          variations: [true, false],
        },
        {
          key: "other_flag_2",
          name: "Other Flag 2",
          description: "Non-hachiko flag",
          kind: "boolean",
          on: true,
          variations: [true, false],
        },
      ]

      const result = filterHachikoFlags(flags, "hachiko_prompts_")
      expect(result).toHaveLength(0)
    })

    it("should return all flags when prefix matches all", () => {
      const flags = [
        {
          key: "hachiko_prompts_plan1_step1",
          name: "Plan 1 Step 1",
          description: "Test flag 1",
          kind: "boolean",
          on: true,
          variations: [true, false],
        },
        {
          key: "hachiko_prompts_plan2_step1",
          name: "Plan 2 Step 1",
          description: "Test flag 2",
          kind: "boolean",
          on: false,
          variations: [true, false],
        },
      ]

      const result = filterHachikoFlags(flags, "hachiko_prompts_")
      expect(result).toHaveLength(2)
    })

    it("should handle empty flag array", () => {
      const flags: any[] = []
      const result = filterHachikoFlags(flags, "hachiko_prompts_")
      expect(result).toHaveLength(0)
    })
  })
})
