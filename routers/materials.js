const express = require('express');
const router = express.Router();
const SteelMaterial = require('../models/SteelMaterial');

// CREATE - 새 재료 생성
router.post('/', async (req, res) => {
  try {
    const { spec, wpm, product, method_calc, initial_length, trade_unit, cat_product } = req.body;
    
    // 필수 필드 검증
    if (!spec || wpm === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'spec과 wpm은 필수 필드입니다.' 
      });
    }

    // 중복 확인
    const existing = await SteelMaterial.findOne({ spec });
    if (existing) {
      return res.status(409).json({ 
        success: false, 
        error: '이미 존재하는 spec입니다.' 
      });
    }

    const material = new SteelMaterial({
      spec,
      wpm: parseFloat(wpm) || 0,
      product: product || '',
      method_calc: parseInt(method_calc) || 0,
      initial_length: parseFloat(initial_length) || 0,
      trade_unit: parseInt(trade_unit) || 0,
      cat_product: parseInt(cat_product) || 0
    });

    await material.save();
    res.status(201).json({ 
      success: true, 
      message: '재료가 성공적으로 생성되었습니다.',
      data: material 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// READ - 전체 조회 (페이지네이션 및 검색 지원)
router.get('/', async (req, res) => {
  try {
    const { 
      spec, 
      product, 
      method_calc,
      cat_product,
      page = 1, 
      limit = 50,
      sort = 'spec',
      order = 'asc'
    } = req.query;
    
    const query = {};
    
    // 검색 필터
    if (spec) query.spec = { $regex: spec, $options: 'i' };
    if (product) query.product = { $regex: product, $options: 'i' };
    if (method_calc) query.method_calc = parseInt(method_calc);
    if (cat_product) query.cat_product = parseInt(cat_product);
    
    // 정렬 설정
    const sortOrder = order === 'desc' ? -1 : 1;
    const sortObj = { [sort]: sortOrder };
    
    // 페이지네이션
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const materials = await SteelMaterial.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort(sortObj);
    
    const total = await SteelMaterial.countDocuments(query);
    
    res.json({
      success: true,
      data: materials,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// READ - 특정 재료 조회 (ID 또는 spec으로)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // MongoDB ObjectId 형식인지 확인
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const material = isObjectId 
      ? await SteelMaterial.findById(id)
      : await SteelMaterial.findOne({ spec: id });
    
    if (!material) {
      return res.status(404).json({ 
        success: false, 
        message: '재료를 찾을 수 없습니다.' 
      });
    }
    
    res.json({ 
      success: true, 
      data: material 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// UPDATE - 재료 수정
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // MongoDB ObjectId 형식인지 확인
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const material = isObjectId 
      ? await SteelMaterial.findById(id)
      : await SteelMaterial.findOne({ spec: id });
    
    if (!material) {
      return res.status(404).json({ 
        success: false, 
        message: '재료를 찾을 수 없습니다.' 
      });
    }

    // 데이터 타입 변환
    if (updateData.wpm !== undefined) updateData.wpm = parseFloat(updateData.wpm);
    if (updateData.method_calc !== undefined) updateData.method_calc = parseInt(updateData.method_calc);
    if (updateData.initial_length !== undefined) updateData.initial_length = parseFloat(updateData.initial_length);
    if (updateData.trade_unit !== undefined) updateData.trade_unit = parseInt(updateData.trade_unit);
    if (updateData.cat_product !== undefined) updateData.cat_product = parseInt(updateData.cat_product);

    // 업데이트
    Object.assign(material, updateData);
    await material.save();
    
    res.json({ 
      success: true, 
      message: '재료가 성공적으로 수정되었습니다.',
      data: material 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// UPDATE - 부분 수정 (PATCH)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // MongoDB ObjectId 형식인지 확인
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const material = isObjectId 
      ? await SteelMaterial.findById(id)
      : await SteelMaterial.findOne({ spec: id });
    
    if (!material) {
      return res.status(404).json({ 
        success: false, 
        message: '재료를 찾을 수 없습니다.' 
      });
    }

    // 데이터 타입 변환
    if (updateData.wpm !== undefined) updateData.wpm = parseFloat(updateData.wpm);
    if (updateData.method_calc !== undefined) updateData.method_calc = parseInt(updateData.method_calc);
    if (updateData.initial_length !== undefined) updateData.initial_length = parseFloat(updateData.initial_length);
    if (updateData.trade_unit !== undefined) updateData.trade_unit = parseInt(updateData.trade_unit);
    if (updateData.cat_product !== undefined) updateData.cat_product = parseInt(updateData.cat_product);

    // 부분 업데이트
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        material[key] = updateData[key];
      }
    });
    
    await material.save();
    
    res.json({ 
      success: true, 
      message: '재료가 성공적으로 수정되었습니다.',
      data: material 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// DELETE - 재료 삭제
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // MongoDB ObjectId 형식인지 확인
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const material = isObjectId 
      ? await SteelMaterial.findByIdAndDelete(id)
      : await SteelMaterial.findOneAndDelete({ spec: id });
    
    if (!material) {
      return res.status(404).json({ 
        success: false, 
        message: '재료를 찾을 수 없습니다.' 
      });
    }
    
    res.json({ 
      success: true, 
      message: '재료가 성공적으로 삭제되었습니다.',
      data: material 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// DELETE - 여러 재료 일괄 삭제
router.delete('/', async (req, res) => {
  try {
    const { ids, specs } = req.body;
    
    if (!ids && !specs) {
      return res.status(400).json({ 
        success: false, 
        error: 'ids 또는 specs 배열이 필요합니다.' 
      });
    }

    let query = {};
    if (ids && ids.length > 0) {
      query._id = { $in: ids };
    } else if (specs && specs.length > 0) {
      query.spec = { $in: specs };
    }

    const result = await SteelMaterial.deleteMany(query);
    
    res.json({ 
      success: true, 
      message: `${result.deletedCount}개의 재료가 삭제되었습니다.`,
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;

