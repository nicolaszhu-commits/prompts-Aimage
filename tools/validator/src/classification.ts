/**
 * 段落分类与图片类型模型（需求 2.5/2.6、3.1/3.2）
 *
 * 把流水线中两处确定性逻辑抽象为可测试的纯函数：
 *   1) 段落分类的「互斥且完备」不变量校验（阶段一，需求 2.5/2.6）；
 *   2) 段落分类 → 图片类型类别的约定映射（阶段二，需求 3.1/3.2）。
 *
 * 本模块无任何文件系统或 I/O 副作用，仅在内存数据结构与字符串上运算，
 * 以便属性化测试（Property 3、Property 4）对其行为进行验证。
 *
 * 设计来源（design.md「数据模型」）：
 *   enum SegmentClassification { DATA_RICH, LOGIC }          // 需求 2.5/2.6
 *     - 不变量：每个被处理的段落映射到「且仅映射到」一个分类值。
 *   enum ImageTypeCategory { DATA_VISUALIZATION, CONCEPT_EXPRESSION }  // 需求 3.1/3.2
 *     - 约定映射：DATA_RICH → DATA_VISUALIZATION，LOGIC → CONCEPT_EXPRESSION。
 *
 * 实现说明：
 * - 采用「`as const` 常量对象 + 同名字面量联合类型」表达枚举，既能在运行时获得
 *   可枚举的成员集合（便于校验与生成器），又能在类型层得到精确的字面量联合，
 *   与 dirs.ts 中 `REQUIRED_DIRS` 的写法保持一致。
 * - 映射函数为「全函数 + 穷尽」：对联合类型的每个成员都有定义，并借助 `never`
 *   断言在编译期保证未来若新增成员必须同步处理。
 */

/**
 * 段落分类（需求 2.5/2.6）。
 *
 * - `DATA_RICH`：被研判为包含详细数据/统计信息的段落（Data_Rich_Segment）。
 * - `LOGIC`：不含详细数据、以逻辑论述为主的段落（Logic_Segment）。
 */
export const SegmentClassification = {
  DATA_RICH: "DATA_RICH",
  LOGIC: "LOGIC",
} as const;

/** 段落分类的字面量联合类型（`"DATA_RICH" | "LOGIC"`）。 */
export type SegmentClassification =
  (typeof SegmentClassification)[keyof typeof SegmentClassification];

/**
 * 段落分类的全部合法取值（声明顺序稳定），供校验与属性化测试生成器使用。
 */
export const SEGMENT_CLASSIFICATION_VALUES = [
  SegmentClassification.DATA_RICH,
  SegmentClassification.LOGIC,
] as const;

/**
 * 图片类型类别（需求 3.1/3.2）。
 *
 * - `DATA_VISUALIZATION`：数据可视化（数据图表、信息图表、量化对比图……）。
 * - `CONCEPT_EXPRESSION`：概念表达（逻辑对比图、概念思维导图、场景插画……）。
 */
export const ImageTypeCategory = {
  DATA_VISUALIZATION: "DATA_VISUALIZATION",
  CONCEPT_EXPRESSION: "CONCEPT_EXPRESSION",
} as const;

/** 图片类型类别的字面量联合类型（`"DATA_VISUALIZATION" | "CONCEPT_EXPRESSION"`）。 */
export type ImageTypeCategory =
  (typeof ImageTypeCategory)[keyof typeof ImageTypeCategory];

/**
 * 图片类型类别的全部合法取值（声明顺序稳定），供校验与属性化测试生成器使用。
 */
export const IMAGE_TYPE_CATEGORY_VALUES = [
  ImageTypeCategory.DATA_VISUALIZATION,
  ImageTypeCategory.CONCEPT_EXPRESSION,
] as const;

/**
 * 各图片类型类别下的具体图片类型标签（与 design.md / 需求 3.1、3.2 的示例对齐）。
 *
 * 这些标签是「具体图片类型」（如「量化对比图」），归属于某个 `ImageTypeCategory`。
 * Property 4 可据此断言：某条提示词的具体图片类型，必属于其来源段落分类所映射的类别。
 *
 * 注意：这是约定的示例集合而非封闭全集；`categoryOfImageType` 对未知标签返回
 * `undefined`，调用方据此判断标签是否属于已知类别。
 */
export const IMAGE_TYPE_LABELS: Readonly<
  Record<ImageTypeCategory, readonly string[]>
> = {
  // 需求 3.1：数据可视化（数据图表、信息图表、量化对比图）。
  [ImageTypeCategory.DATA_VISUALIZATION]: ["数据图表", "信息图表", "量化对比图"],
  // 需求 3.2：概念表达（逻辑对比图、概念思维导图、场景插画）。
  [ImageTypeCategory.CONCEPT_EXPRESSION]: ["逻辑对比图", "概念思维导图", "场景插画"],
} as const;

/**
 * 段落分类 → 图片类型类别的约定映射（需求 3.1/3.2）。
 *
 * 约定：`DATA_RICH → DATA_VISUALIZATION`，`LOGIC → CONCEPT_EXPRESSION`。
 * 本函数为「全函数且穷尽」：对 `SegmentClassification` 的每个成员都有确定结果；
 * 若将来联合类型新增成员而此处未处理，`default` 分支的 `never` 断言会触发编译错误。
 *
 * @param classification 段落分类。
 * @returns 该分类对应的图片类型类别。
 */
export function categoryForClassification(
  classification: SegmentClassification,
): ImageTypeCategory {
  switch (classification) {
    case SegmentClassification.DATA_RICH:
      return ImageTypeCategory.DATA_VISUALIZATION;
    case SegmentClassification.LOGIC:
      return ImageTypeCategory.CONCEPT_EXPRESSION;
    default:
      return assertNever(classification);
  }
}

/**
 * 类型守卫：判断任意值是否为合法的 `SegmentClassification` 枚举成员。
 *
 * 供不变量校验与属性化测试使用——既能在运行时拒绝非枚举值，也能在类型层收窄。
 *
 * @param value 待判定的任意值。
 * @returns 当且仅当 `value` 是 `DATA_RICH` 或 `LOGIC` 时为 `true`。
 */
export function isSegmentClassification(
  value: unknown,
): value is SegmentClassification {
  return (
    typeof value === "string" &&
    (SEGMENT_CLASSIFICATION_VALUES as readonly string[]).includes(value)
  );
}

/**
 * 类型守卫：判断任意值是否为合法的 `ImageTypeCategory` 枚举成员。
 *
 * @param value 待判定的任意值。
 * @returns 当且仅当 `value` 是 `DATA_VISUALIZATION` 或 `CONCEPT_EXPRESSION` 时为 `true`。
 */
export function isImageTypeCategory(
  value: unknown,
): value is ImageTypeCategory {
  return (
    typeof value === "string" &&
    (IMAGE_TYPE_CATEGORY_VALUES as readonly string[]).includes(value)
  );
}

/**
 * 根据具体图片类型标签反查其所属类别（需求 3.1/3.2）。
 *
 * @param label 具体图片类型标签，例如「量化对比图」「概念思维导图」。
 * @returns 标签所属的 `ImageTypeCategory`；若标签不在已知集合内则返回 `undefined`。
 */
export function categoryOfImageType(
  label: string,
): ImageTypeCategory | undefined {
  for (const category of IMAGE_TYPE_CATEGORY_VALUES) {
    if (IMAGE_TYPE_LABELS[category].includes(label)) {
      return category;
    }
  }
  return undefined;
}

/**
 * 判断「具体图片类型标签」是否与「段落分类」一致（Property 4 的判定核心，需求 3.1/3.2）。
 *
 * 一致的条件是：标签所属类别，恰好等于该段落分类经约定映射得到的类别。
 * 未知标签（`categoryOfImageType` 返回 `undefined`）一律视为不一致。
 *
 * @param classification 段落分类。
 * @param imageTypeLabel 该段落对应提示词的具体图片类型标签。
 * @returns 当且仅当标签类别与分类映射类别一致时为 `true`。
 */
export function isImageTypeConsistentWithClassification(
  classification: SegmentClassification,
  imageTypeLabel: string,
): boolean {
  const labelCategory = categoryOfImageType(imageTypeLabel);
  return labelCategory === categoryForClassification(classification);
}

/**
 * 段落的「原始分类标注」：段落标识符 + 被赋予的分类标签列表。
 *
 * 之所以用「标签列表」（而非单个值）建模，是为了让 Property 3 能够表达并检验
 * 「未分类」（空列表）、「多重分类」（多个值）与「非枚举值」等违例情形，
 * 从而验证「互斥且完备」不变量：每段恰好一个、且为枚举内成员。
 */
export interface RawSegmentClassification {
  /** 段落标识（如小标题、原文出现序号字符串等），用于区分不同段落。 */
  readonly segmentId: string;
  /** 该段落被赋予的分类标签列表（合法情形应恰好含一个枚举成员）。 */
  readonly classifications: readonly string[];
}

/**
 * 已校验通过的段落分类：标识符 + 唯一且合法的分类值。
 *
 * 对应 design.md 中 ImagePrompt 内部记录的 `classification` 字段（已收窄为合法枚举）。
 */
export interface ClassifiedSegment {
  /** 段落标识。 */
  readonly segmentId: string;
  /** 唯一且合法的段落分类值。 */
  readonly classification: SegmentClassification;
}

/**
 * 校验单个段落是否「恰好被赋予一个枚举内分类」（需求 2.5/2.6 不变量）。
 *
 * 即：分类标签列表长度恰好为 1，且该唯一标签是合法的 `SegmentClassification` 成员。
 * 空列表（未分类）、多于一个（多重分类）、含非枚举值（非法分类）均判为不满足。
 *
 * @param segment 段落的原始分类标注。
 * @returns 当且仅当满足「互斥且完备」不变量时为 `true`。
 */
export function isSegmentClassifiedExactlyOnce(
  segment: RawSegmentClassification,
): boolean {
  return (
    segment.classifications.length === 1 &&
    isSegmentClassification(segment.classifications[0])
  );
}

/**
 * 校验一批段落的分类结果是否整体满足「互斥且完备」不变量（Property 3，需求 2.5/2.6）。
 *
 * 当且仅当集合中「每个」段落都恰好被赋予一个枚举内分类时返回 `true`；
 * 任一段落违例（未分类/多重分类/非法值）即返回 `false`。空集合视为平凡满足（`true`）。
 *
 * @param segments 段落原始分类标注的可迭代集合。
 * @returns 整体是否满足不变量。
 */
export function validateClassifications(
  segments: Iterable<RawSegmentClassification>,
): boolean {
  for (const segment of segments) {
    if (!isSegmentClassifiedExactlyOnce(segment)) {
      return false;
    }
  }
  return true;
}

/**
 * 穷尽性断言辅助函数：用于 `switch` 的 `default` 分支。
 *
 * 若所有枚举成员均已在前面的分支处理，控制流将永远不会到达此处，故参数类型为 `never`；
 * 一旦联合类型新增成员而未同步处理，传入此函数将产生编译期类型错误，从而提示补全分支。
 * 运行时若仍被异常调用（例如越过类型系统传入非法值），则抛出错误以快速失败。
 *
 * @param value 理论上不可能出现的值。
 * @throws 总是抛出错误。
 */
function assertNever(value: never): never {
  throw new Error(`未处理的枚举成员：${String(value)}`);
}
