/**
 * 分类→图片类型一致映射属性化测试（Property 4）
 *
 * Feature: markdown-image-prompt-pipeline, Property 4: 分类与图片类型类别一致映射
 *   对于任意已分类段落集合所生成的提示词，每条提示词的图片类型类别都应与其来源段落
 *   的分类一致：`Data_Rich_Segment`（DATA_RICH）段落对应的提示词图片类型必属于
 *   「数据可视化」（DATA_VISUALIZATION）类别，`Logic_Segment`（LOGIC）段落对应的
 *   提示词图片类型必属于「概念表达」（CONCEPT_EXPRESSION）类别。
 *
 * Validates: Requirements 3.1, 3.2
 *
 * 说明：
 * - 使用成熟的属性化测试库 fast-check（项目已有 devDependency），不自行实现 PBT 框架。
 * - 使用 vitest 作为测试运行器（脚本 "test": "vitest --run"）。
 * - 项目为 ESM + NodeNext，相对导入需带 `.js` 扩展名（编译产物约定）。
 * - 本文件仅实现 Property 4 这一条属性（一个属性 = 一个属性化测试）。
 *
 * 验证思路：
 *   随机生成已分类段落（segmentId + classification ∈ {DATA_RICH, LOGIC}）。
 *   对每个段落，按流水线的约定映射 `categoryForClassification` + `IMAGE_TYPE_LABELS`
 *   选取一个「正确类别」下的具体图片类型标签，断言
 *   `isImageTypeConsistentWithClassification` 为 true；
 *   再取「相反类别」下的标签，断言其为 false。
 *   后者确保一致性判定是「精确正确」而非恒真的平凡映射（非空洞）。
 *   同时在迭代中直接断言约定映射本身：
 *     categoryForClassification(DATA_RICH) === DATA_VISUALIZATION
 *     categoryForClassification(LOGIC)     === CONCEPT_EXPRESSION
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  SegmentClassification,
  ImageTypeCategory,
  SEGMENT_CLASSIFICATION_VALUES,
  IMAGE_TYPE_LABELS,
  categoryForClassification,
  categoryOfImageType,
  isImageTypeConsistentWithClassification,
  type ClassifiedSegment,
  type SegmentClassification as SegmentClassificationType,
  type ImageTypeCategory as ImageTypeCategoryType,
} from "../src/classification.js";

/** 已分类段落生成器：segmentId + 合法枚举分类值。 */
const classifiedSegment: fc.Arbitrary<ClassifiedSegment> = fc.record({
  segmentId: fc.string({ minLength: 1, maxLength: 12 }),
  classification: fc.constantFrom(
    ...SEGMENT_CLASSIFICATION_VALUES,
  ) as fc.Arbitrary<SegmentClassificationType>,
});

/** 返回某类别下「具体图片类型标签」的索引选择器生成器。 */
const labelIndex: fc.Arbitrary<number> = fc.nat();

/** 取得某类别下、由索引选定的具体图片类型标签。 */
function pickLabel(category: ImageTypeCategoryType, idx: number): string {
  const labels = IMAGE_TYPE_LABELS[category];
  return labels[idx % labels.length];
}

/** 取得与给定类别相反的类别。 */
function oppositeCategory(
  category: ImageTypeCategoryType,
): ImageTypeCategoryType {
  return category === ImageTypeCategory.DATA_VISUALIZATION
    ? ImageTypeCategory.CONCEPT_EXPRESSION
    : ImageTypeCategory.DATA_VISUALIZATION;
}

describe("Property 4: 分类与图片类型类别一致映射 (Requirements 3.1, 3.2)", () => {
  // Feature: markdown-image-prompt-pipeline, Property 4: 分类与图片类型类别一致映射
  it("正确类别标签一致(true)、相反类别标签不一致(false)，且约定映射成立", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ segment: classifiedSegment, idx: labelIndex }),
          { minLength: 1, maxLength: 20 },
        ),
        (items) => {
          for (const { segment, idx } of items) {
            const { classification } = segment;

            // 该分类经约定映射得到的「正确类别」。
            const correctCategory = categoryForClassification(classification);

            // (1) 约定映射本身：DATA_RICH→数据可视化，LOGIC→概念表达。
            if (classification === SegmentClassification.DATA_RICH) {
              expect(correctCategory).toBe(
                ImageTypeCategory.DATA_VISUALIZATION,
              );
            } else {
              expect(classification).toBe(SegmentClassification.LOGIC);
              expect(correctCategory).toBe(
                ImageTypeCategory.CONCEPT_EXPRESSION,
              );
            }

            // (2) 正确类别下的具体标签 → 一致性判定为 true。
            const correctLabel = pickLabel(correctCategory, idx);
            expect(
              isImageTypeConsistentWithClassification(
                classification,
                correctLabel,
              ),
            ).toBe(true);
            // 该标签反查类别也应等于正确类别（自洽）。
            expect(categoryOfImageType(correctLabel)).toBe(correctCategory);

            // (3) 相反类别下的具体标签 → 一致性判定为 false（非平凡/非空洞）。
            const wrongLabel = pickLabel(oppositeCategory(correctCategory), idx);
            expect(
              isImageTypeConsistentWithClassification(
                classification,
                wrongLabel,
              ),
            ).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: markdown-image-prompt-pipeline, Property 4: 分类与图片类型类别一致映射
  it("数据段落标签均属「数据可视化」、逻辑段落标签均属「概念表达」", () => {
    fc.assert(
      fc.property(classifiedSegment, labelIndex, (segment, idx) => {
        const category = categoryForClassification(segment.classification);
        const label = pickLabel(category, idx);

        if (segment.classification === SegmentClassification.DATA_RICH) {
          // 数据段落：标签必归属「数据可视化」类别。
          expect(categoryOfImageType(label)).toBe(
            ImageTypeCategory.DATA_VISUALIZATION,
          );
        } else {
          // 逻辑段落：标签必归属「概念表达」类别。
          expect(categoryOfImageType(label)).toBe(
            ImageTypeCategory.CONCEPT_EXPRESSION,
          );
        }

        // 一致性判定必为 true（正确映射的标签）。
        expect(
          isImageTypeConsistentWithClassification(segment.classification, label),
        ).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  // 锚定具体示例，作为属性的可读佐证（非额外属性）。
  it("示例：DATA_RICH↔量化对比图(一致)、LOGIC↔概念思维导图(一致)、交叉(不一致)", () => {
    // 约定映射。
    expect(categoryForClassification(SegmentClassification.DATA_RICH)).toBe(
      ImageTypeCategory.DATA_VISUALIZATION,
    );
    expect(categoryForClassification(SegmentClassification.LOGIC)).toBe(
      ImageTypeCategory.CONCEPT_EXPRESSION,
    );

    // 正确映射 → 一致。
    expect(
      isImageTypeConsistentWithClassification(
        SegmentClassification.DATA_RICH,
        "量化对比图",
      ),
    ).toBe(true);
    expect(
      isImageTypeConsistentWithClassification(
        SegmentClassification.LOGIC,
        "概念思维导图",
      ),
    ).toBe(true);

    // 交叉映射 → 不一致。
    expect(
      isImageTypeConsistentWithClassification(
        SegmentClassification.DATA_RICH,
        "概念思维导图",
      ),
    ).toBe(false);
    expect(
      isImageTypeConsistentWithClassification(
        SegmentClassification.LOGIC,
        "量化对比图",
      ),
    ).toBe(false);
  });
});
